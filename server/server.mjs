import http from "node:http";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

function expandWindowsEnv(value) {
  return String(value).replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? `%${name}%`);
}

const port = Number(process.env.PORT ?? 3201);
const apiKey = process.env.OPENAI_API_KEY;

// Model roles.
//
// One text model now serves every text role. Each role stays individually overridable so a single
// role can be pinned without disturbing the others.
//
// The room render is deliberately NOT on the text model. Verified against the live API:
// POST /v1/images/edits with model "gpt-5.6-luna" returns
//   400 image_generation_user_error: "The model 'gpt-5.6-luna' does not exist."
// That endpoint only accepts image models, so the render stays on gpt-image-2.
const textModel = process.env.OPENAI_TEXT_MODEL ?? "gpt-5.6-luna";
const analysisModel = process.env.OPENAI_ANALYSIS_MODEL ?? textModel;
const productSearchModel = process.env.OPENAI_PRODUCT_SEARCH_MODEL ?? textModel;
const productParseModel = process.env.OPENAI_PRODUCT_PARSE_MODEL ?? textModel;
const imageModel = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
const dataDir = expandWindowsEnv(process.env.ROOMMUSE_DATA_DIR ?? join(process.cwd(), "storage"));
const storageDir = join(dataDir, "designs");
const projectDir = join(dataDir, "projects");
const logDir = join(dataDir, "logs");
const logFile = join(logDir, "ai.log");
mkdirSync(storageDir, { recursive: true });
mkdirSync(projectDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  appendFileSync(logFile, `${line}\n`);
  console.log(line);
}

const fallbackPlans = {
  bedroom: [["Upholstered bed", "Furniture", "Room-scaled upholstered bed", 1, 999], ["Bedside table", "Furniture", "Compact bedside storage", 2, 229], ["Bedside lamp", "Lighting", "Warm dimmable bedside light", 2, 119], ["Area rug", "Textiles", "Soft rug sized to extend beyond the bed", 1, 399]],
  dining: [["Dining table", "Furniture", "Table sized for the visible dining zone", 1, 899], ["Dining chair", "Furniture", "Coordinated dining seating", 6, 189], ["Dining pendant", "Lighting", "Dimmable fixture centered over the table", 1, 349], ["Window panels", "Window treatments", "Full-height light-filtering panels", 2, 99]],
  office: [["Work desk", "Furniture", "Desk scaled to the visible work wall", 1, 549], ["Ergonomic chair", "Furniture", "Supportive adjustable task chair", 1, 429], ["Task lamp", "Lighting", "Focused dimmable desk lighting", 1, 129], ["Storage unit", "Furniture", "Closed storage for the visible office zone", 1, 399]],
  default: [["Room-anchoring furniture", "Furniture", "Primary piece scaled for the photographed room", 1, 1099], ["Area rug", "Textiles", "Rug scaled to connect the main furniture group", 1, 449], ["Task light", "Lighting", "Dimmable light for the room's primary activity", 1, 189], ["Window treatment", "Window treatments", "Full-height treatment for the visible window", 2, 109], ["Wall finish", "Finishes", "Coordinated low-VOC interior finish", 2, 59]]
};
function roomPlan(analysis) {
  const type = String(analysis.roomType ?? "").toLowerCase();
  // Choose by EARLIEST mention, not by object-key order, and let a primary living space win.
  //
  // "Open-plan living room with an adjoining home-office zone" contains "office", so key-order
  // matching returned the office-only plan and dropped the living area — the room the user
  // actually photographed. Open-plan spaces name a secondary zone constantly, so this matters.
  const specialised = Object.keys(fallbackPlans)
    .filter(name => name !== "default" && type.includes(name))
    .sort((a, b) => type.indexOf(a) - type.indexOf(b))[0];
  const livingAt = Math.min(...["living", "family room", "great room", "lounge"].map(word => {
    const at = type.indexOf(word);
    return at < 0 ? Number.POSITIVE_INFINITY : at;
  }));
  const key = !specialised || livingAt < type.indexOf(specialised) ? "default" : specialised;
  return fallbackPlans[key].map(([name, category, description, quantity, estimatedUnitPrice]) => ({ name, category, description, quantity, estimatedUnitPrice, dimensions: "Confirm against field measurements", finish: "Coordinate with the selected palette", rationale: `Recommended for the photographed ${analysis.roomType ?? "room"}.`, priority: "High impact", searchQuery: name }));
}
function isDirectProductUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.toLowerCase().replace(/\/+$/, "");
    const blocked = ["/search", "/s/", "/b/", "/keyword", "/collections/", "/category/", "/categories/", "/browse/"];
    if (url.protocol !== "https:" || !hostname.includes(".") || !path || blocked.some(part => path.includes(part)) || ["q", "query", "keyword"].some(key => url.searchParams.has(key))) return false;
    // Per-retailer product-page shapes. Widen ONLY with evidence of a real product URL being
    // wrongly rejected — a pattern that is too loose lets a category page through as a product,
    // which is the failure this whole gate exists to prevent.
    // KEEP IN SYNC with src/productLinks.ts; a test asserts the two tables are identical.
    const retailerPatterns = [
      ["homedepot.com", /^\/p\//],
      ["lowes.com", /^\/pd\//],
      ["target.com", /^\/p\//],
      ["walmart.com", /^\/ip\//],
      ["ikea.com", /\/p\//],
      ["wayfair.com", /\/pdp\//],
      ["westelm.com", /^\/products\//],
      ["potterybarn.com", /^\/products\//],
      ["crateandbarrel.com", /\/[sf]\d+$/],
      ["lampsplus.com", /^\/(p|products)\//],
      ["rugsusa.com", /^\/products\//]
    ];
    const retailer = retailerPatterns.find(([domain]) => hostname === domain || hostname.endsWith(`.${domain}`));
    return retailer ? retailer[1].test(path) : true;
  } catch {
    return false;
  }
}
// Shared by the room analysis and the per-variation concept brief so both describe items identically.
const shoppingItemsSchema = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: ["Furniture", "Lighting", "Textiles", "Window treatments", "Finishes", "Art", "Decor"] },
          description: { type: "string" },
          quantity: { type: "integer" },
          estimatedUnitPrice: { type: "number" },
          dimensions: { type: "string" },
          finish: { type: "string" },
          rationale: { type: "string" },
          priority: { type: "string", enum: ["Essential", "High impact", "Finishing touch"] },
          searchQuery: { type: "string" },
          retainedExisting: { type: "boolean" }
        },
        required: ["name", "category", "description", "quantity", "estimatedUnitPrice", "dimensions", "finish", "rationale", "priority", "searchQuery", "retainedExisting"]
      }
    };
function sourceShoppingItems(analysis) {
  const source = Array.isArray(analysis.shoppingItems) && analysis.shoppingItems.length ? analysis.shoppingItems : roomPlan(analysis);
  return source.slice(0, 10);
}
function responseText(payload) {
  return payload.output_text ?? payload.output?.flatMap(item => item.content ?? []).find(item => item.type === "output_text")?.text;
}
const retailerDomains = [
  "wayfair.com", "homedepot.com", "lowes.com", "target.com", "walmart.com",
  "ikea.com", "westelm.com", "potterybarn.com", "crateandbarrel.com",
  "lampsplus.com", "rugsusa.com"
];
function sourceUrlKey(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["ref", "ref_"].includes(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}
function isAllowedRetailerSource(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return retailerDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}
// Free-text guidance assembled from the project's budget and constraints. Threaded into both the
// room analysis and the product search so the plan is shaped by them up front, rather than being
// generated blind and filtered afterwards (REQ-2, REQ-10).
function planContext(context = {}) {
  const { budget, constraints = [], retainedItems = [], roomDimensions } = context;
  const parts = [];
  if (Number(budget?.total) > 0) parts.push(`The whole-room budget is $${Math.round(Number(budget.total))} USD. Choose pieces that fit inside it as a complete plan; spend the largest share on the anchor pieces and keep finishing touches modest.`);
  const active = constraints.filter(c => c && !c.releasedAt).map(c => c.label).filter(Boolean);
  if (active.length) parts.push(`The user has fixed these decisions and they must be respected: ${active.join("; ")}. Do NOT propose replacing anything covered by them.`);
  if (retainedItems.length) parts.push(`These existing items are being kept and must not appear as purchases: ${retainedItems.join(", ")}.`);
  if (roomDimensions) parts.push(`Stated room dimensions: ${roomDimensions}.`);
  return parts.join(" ");
}

async function resolveProductBatch(entries, style, context = {}) {
  const empty = new Map(entries.map(entry => [entry.requestIndex, []]));
  if (!apiKey || !entries.length) return empty;
  const guidance = planContext(context);
  const productSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      tier: { type: "string", enum: ["save", "balanced", "invest"] },
      productName: { type: "string" },
      retailer: { type: "string" },
      directUrl: { type: "string" },
      currentPrice: { type: "number" },
      currency: { type: "string", enum: ["USD"] },
      availability: { type: "string" }
    },
    required: ["tier", "productName", "retailer", "directUrl", "currentPrice", "currency", "availability"]
  };
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      matches: {
        type: "array",
        maxItems: entries.length,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            requestIndex: { type: "integer" },
            products: { type: "array", maxItems: 3, items: productSchema }
          },
          required: ["requestIndex", "products"]
        }
      }
    },
    required: ["matches"]
  };
  try {
    // Live product search runs through the Responses API web_search tool.
    //
    // It cannot use chat/completions + web_search_options: that parameter is specific to the
    // *-search-preview models. Verified against the live API, the text model returns
    //   400 invalid_request_error: "Unknown parameter: 'web_search_options'."
    // The web_search tool is the supported path and is strictly better here — the model issues
    // several searches and reasons across them, rather than one shot.
    //
    // The safety property is unchanged and non-negotiable: only URLs the model actually cited are
    // eligible. In this API the citation is flat (annotation.url) rather than nested under
    // annotation.url_citation.url as it was in chat/completions.
    const searchResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(180000),
      body: JSON.stringify({
        model: productSearchModel,
        tools: [{ type: "web_search", search_context_size: "medium", user_location: { type: "approximate", country: "US" } }],
        input: `Today is ${new Date().toISOString().slice(0, 10)}. Find currently purchasable products matching EACH request below for a ${style} room design. Requests: ${JSON.stringify(entries.map(({ requestIndex, raw }) => ({ requestIndex, name: raw.name, category: raw.category, description: raw.description, dimensions: raw.dimensions, finish: raw.finish })))}. Use only these retailers: ${retailerDomains.join(", ")}. ${guidance} Preserve each requestIndex. For each request, find up to three distinct save, balanced, and invest choices when available. State requestIndex, tier, exact product name, retailer, exact product-page URL, current listed USD price, and availability. Cite the exact retailer product page for every product and price. Never use search/category pages, estimates, MSRP substitutions, unrelated products, or uncited claims.`
      })
    });
    if (!searchResponse.ok) throw new Error(`product search returned ${searchResponse.status}: ${(await searchResponse.text()).slice(0, 180)}`);
    const searchPayload = await searchResponse.json();
    const messageParts = (searchPayload.output ?? []).filter(item => item.type === "message").flatMap(item => item.content ?? []);
    const searchText = messageParts.filter(part => part.type === "output_text").map(part => part.text).join("\n");
    const sourceUrls = new Set(messageParts
      .flatMap(part => part.annotations ?? [])
      .filter(annotation => annotation.type === "url_citation")
      .map(annotation => annotation.url)
      .filter(url => isDirectProductUrl(url) && isAllowedRetailerSource(url))
      .map(sourceUrlKey));
    if (!sourceUrls.size) return empty;
    const parseResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: productParseModel,
        input: `Convert the cited retailer search into the required JSON. Preserve requestIndex and infer tier from explicit labels or relative price. Use ONLY these exact cited product URLs: ${JSON.stringify([...sourceUrls])}. Omit claims without an exact cited URL and numeric current USD price. Search text: ${searchText.slice(0, 20000)}`,
        text: { format: { type: "json_schema", name: "verified_retail_product_batch", strict: true, schema } }
      })
    });
    if (!parseResponse.ok) throw new Error(`product parsing returned ${parseResponse.status}: ${(await parseResponse.text()).slice(0, 180)}`);
    const parsed = JSON.parse(String(responseText(await parseResponse.json())));
    const allowedIndexes = new Set(entries.map(entry => entry.requestIndex));
    for (const match of Array.isArray(parsed.matches) ? parsed.matches : []) {
      if (!allowedIndexes.has(match.requestIndex)) continue;
      const products = (Array.isArray(match.products) ? match.products : []).filter(product =>
        isDirectProductUrl(product.directUrl) &&
        sourceUrls.has(sourceUrlKey(product.directUrl)) &&
        Number.isFinite(Number(product.currentPrice)) &&
        Number(product.currentPrice) > 0 &&
        product.currency === "USD"
      );
      empty.set(match.requestIndex, products);
    }
    return empty;
  } catch (error) {
    log(`[products] batch ${entries.map(entry => entry.raw.name ?? entry.requestIndex).join(", ")}: ${error instanceof Error ? error.message : error}`);
    return empty;
  }
}
async function resolveShoppingItems(analysis, style, conceptId, context = {}) {
  const checkedAt = new Date().toISOString();
  const source = sourceShoppingItems(analysis);
  const batches = [];
  for (let index = 0; index < source.length; index += 2) {
    batches.push(source.slice(index, index + 2).map((raw, offset) => ({ requestIndex: index + offset, raw })));
  }
  const resolvedBatches = await Promise.all(batches.map(batch => resolveProductBatch(batch, style, context)));
  const choicesByIndex = new Map();
  for (const batch of resolvedBatches) for (const [index, choices] of batch) choicesByIndex.set(index, choices);
  const unmatched = source
    .map((raw, requestIndex) => ({ requestIndex, raw }))
    .filter(entry => !(choicesByIndex.get(entry.requestIndex)?.length));
  const fallbackBatches = await Promise.all(unmatched.map(entry => resolveProductBatch([entry], style, context)));
  for (const batch of fallbackBatches) {
    for (const [index, choices] of batch) if (choices.length) choicesByIndex.set(index, choices);
  }
  return source.map((raw, index) => {
    const category = ["Furniture", "Lighting", "Textiles", "Window treatments", "Finishes", "Art", "Decor"].includes(raw.category) ? raw.category : "Decor";
    const requestedName = String(raw.name ?? `${style} room piece`).slice(0, 100);
    const estimatedPrice = Math.max(10, Math.round(Number(raw.estimatedUnitPrice) || 100));
    const choices = choicesByIndex.get(index) ?? [];
    const primary = choices.find(product => product.tier === "balanced") ?? choices.find(product => product.tier === "invest") ?? choices[0];
    const verified = Boolean(primary);
    const base = {
      name: primary?.productName ?? requestedName,
      retailer: primary?.retailer ?? "Product match pending",
      purchaseUrl: primary?.directUrl ?? "",
      unitPrice: primary ? Math.round(Number(primary.currentPrice) * 100) / 100 : estimatedPrice,
      dimensions: String(raw.dimensions ?? "Confirm against field measurements"),
      finish: String(raw.finish ?? "Coordinate with the selected palette"),
      rationale: String(raw.rationale ?? `Selected for its role in the photographed room and the ${style} design.`),
      priceStatus: verified ? "verified" : "estimate",
      lastPriceCheckedAt: verified ? checkedAt : undefined,
      budgetTier: primary?.tier
    };
    const alternatives = choices.filter(product => product !== primary).map((product, productIndex) => ({
      id: `${conceptId}-${index}-${product.tier}-${productIndex}`,
      name: product.productName,
      retailer: product.retailer,
      purchaseUrl: product.directUrl,
      unitPrice: Math.round(Number(product.currentPrice) * 100) / 100,
      dimensions: base.dimensions,
      finish: base.finish,
      difference: `${product.tier[0].toUpperCase() + product.tier.slice(1)} tier verified product`,
      available: true,
      availability: product.availability,
      priceStatus: "verified",
      lastPriceCheckedAt: checkedAt,
      budgetTier: product.tier,
      provenance: "verified",
      priceHistory: [{ price: Math.round(Number(product.currentPrice) * 100) / 100, currency: "USD", observedAt: checkedAt, availability: product.availability, source: "verified", url: product.directUrl }]
    }));
    return {
      id: `${conceptId}-room-${index}`,
      conceptId,
      ...base,
      category,
      description: String(raw.description ?? requestedName),
      quantity: Math.max(1, Math.min(12, Math.round(Number(raw.quantity) || 1))),
      priority: ["Essential", "High impact", "Finishing touch"].includes(raw.priority) ? raw.priority : "High impact",
      isOwned: Boolean(raw.retainedExisting),
      isStructurallyImportant: raw.priority === "Essential",
      matchIndicators: [`Grounded in photographed ${analysis.roomType ?? "room"}`, `Matches ${style} direction`],
      availability: primary?.availability ?? "No exact product page and current price could be verified. Purchase link withheld.",
      originalSelection: base,
      alternatives,
      // REQ-11 provenance. "verified" means: confirmed on the retailer's own product page, with a
      // current price, at a recorded time. Anything else is "generated" — a design recommendation
      // with no purchasable product attached — and carries an explicit unresolved reason so the UI
      // can say so rather than dressing an estimate up as a real listing.
      provenance: verified ? "verified" : "generated",
      priceHistory: verified
        ? [{ price: base.unitPrice, currency: "USD", observedAt: checkedAt, availability: primary.availability, source: "verified", url: base.purchaseUrl }]
        : [],
      unresolved: verified ? undefined : {
        reason: choices.length ? "no-verified-price" : "no-match",
        note: `No retailer product page with a confirmed current price could be verified for this ${category.toLowerCase()} piece.`,
        lastAttemptedAt: checkedAt
      }
    };
  });
}

const palettes = {
  Modern: ["#D8CFC0", "#262923", "#F5F2EA"], Contemporary: ["#B8A99A", "#788078", "#F4F0E8"],
  Traditional: ["#6F4E37", "#B69B74", "#E9E0CF"], "Organic Modern": ["#8A9478", "#C4AA88", "#EEE9DE"],
  Scandinavian: ["#D7C8AE", "#AEB7AE", "#FAF8F2"], Japandi: ["#8A7561", "#C9B99F", "#E8E2D7"],
  "Mid-Century Modern": ["#C46F3B", "#48645A", "#E8D5B5"], Transitional: ["#A89C8D", "#4E5B57", "#EEE9E1"],
  "Art Deco": ["#C8A45D", "#173D3A", "#F2E8D5"], Coastal: ["#A8C4C9", "#547A87", "#F3EFE4"],
  Industrial: ["#8B8178", "#3C4140", "#D8C6AA"], Bohemian: ["#B96845", "#7B7751", "#E9D2B7"],
  "French Country": ["#9BA79A", "#6D7B8B", "#EFE4D2"]
};

function concept(style, id, beforeImageUrl, imageDataUrl, roomAnalysis, shoppingItems, variants = []) {
  return { id, title: style + " Signature", style, beforeImageUrl, imageDataUrl,
    summary: "A room-grounded " + style.toLowerCase() + " direction with deliberate layout, lighting, materials, and pieces.",
    palette: palettes[style] ?? palettes.Modern,
    principles: ["Preserve visible circulation", "Coordinate materials across the complete room", "Layer ambient, task, and accent lighting"],
    shoppingItems,
    roomAnalysis,
    designReport: buildDesignReport(roomAnalysis, style, "Signature"),
    variants
  };
}
function inputImageInfo(buffer) {
  const isPng = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  return isPng ? { extension: "png", mime: "image/png" } : { extension: "jpg", mime: "image/jpeg" };
}

// Renders one concept from ALL captured views.
//
// S-1 spike result (2026-08-17, measured against a real three-photo scan):
//   - /v1/images/edits accepts multiple images, but ONLY via repeated `image[]` fields. Repeating
//     `image` returns 400 duplicate_parameter.
//   - The FIRST image is the base: it defines the camera, framing and geometry of the output.
//   - The remaining images are genuinely used. With the base view alone, the render invented a
//     plain curtained wall on the right. With a second view attached and the prompt naming it as
//     the same room from another angle, the render correctly produced the French doors, the
//     adjoining dining area and the stair railing — none of which are visible in the base photo.
//   - The explicit "same space from other angles" wording is load-bearing: without it the extra
//     views influenced the result only weakly.
// So all three photos now contribute to the image, not just the analysis (REQ-4).
async function renderRoom(scans, style, conceptName = "Signature", instructions = "") {
  if (!apiKey) throw new Error("AI rendering is not configured yet. Add OPENAI_API_KEY to the local .env file and restart Tracy’s Room Muse.");
  const views = (Array.isArray(scans) ? scans : [scans]).filter(Boolean);
  if (!views.length) throw new Error("At least one room image is required to render a design.");
  const direction = conceptName === "Refined"
    ? "quiet, tonal, timeless, and lower in visual complexity"
    : conceptName === "Expressive"
      ? "bold but practical, with sculptural furniture, stronger contrast, and decorative lighting"
      : "balanced, broadly appealing, and moderately layered";
  let failure = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const form = new FormData();
    form.append("model", imageModel);
    views.forEach((view, index) => form.append("image[]", new File([view.buffer], view.mime === "image/png" ? `room-${index}.png` : `room-${index}.jpg`, { type: view.mime })));
    const refinement = String(instructions).trim().slice(0, 1000);
    const multiView = views.length > 1
      ? " The first image is the room to redesign and defines the camera position, framing, and geometry of the output. The additional images show the SAME space from other angles: use them to keep the far end of the room, the window wall, and any adjoining areas spatially accurate. Do not move the camera to match them."
      : "";
    form.append("prompt", "Photorealistically redesign this exact room in an elegant " + style + " style as the " + conceptName + " concept: " + direction + ". Preserve architecture, windows, doors, camera, floor, ceiling, and room geometry." + multiView + " Make furniture silhouettes, layout emphasis, lighting, rug, wall and window treatment, materials, accents, art, and decor meaningfully distinct for this direction. Keep circulation practical." + (refinement ? " Apply these user-requested changes: " + refinement + "." : "") + " Do not add text, people, or watermarks.");
    form.append("size", "1536x1024");
    form.append("quality", "medium");
    form.append("output_format", "jpeg");
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey },
      body: form,
      signal: AbortSignal.timeout(150000)
    });
    if (response.ok) {
      const payload = await response.json();
      if (payload.data?.[0]?.b64_json) return Buffer.from(payload.data[0].b64_json, "base64");
      if (payload.data?.[0]?.url) {
        const imageResponse = await fetch(payload.data[0].url, { signal: AbortSignal.timeout(60000) });
        if (imageResponse.ok) return Buffer.from(await imageResponse.arrayBuffer());
      }
      throw new Error("The image service returned no generated image.");
    }
    failure = (await response.text()).slice(0, 300);
    if (response.status !== 429 && response.status < 500) break;
    await new Promise(resolve => setTimeout(resolve, attempt * 1500));
  }
  throw new Error("Image service failed: " + failure);
}
function fallbackRoomAnalysis() {
  return {
    roomType: "living room",
    proportions: "Confirm room proportions with field measurements.",
    focalPoints: ["main visible architectural feature"],
    lighting: "Natural-light direction is inferred from the uploaded photograph.",
    retainedElements: ["windows", "flooring", "architectural openings"],
    circulation: "Keep the visible entry-to-window route open.",
    confidence: "limited"
  };
}

async function analyzeRoom(imageBuffer, imageMime, style, additionalImages = [], context = {}) {
  if (!apiKey) return fallbackRoomAnalysis();
  const fields = {
    roomType: { type: "string" },
    proportions: { type: "string" },
    focalPoints: { type: "array", items: { type: "string" } },
    lighting: { type: "string" },
    retainedElements: { type: "array", items: { type: "string" } },
    circulation: { type: "string" },
    confidence: { type: "string" },
    shoppingItems: shoppingItemsSchema
  };
  let failure;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          model: analysisModel,
          input: [{ role: "user", content: [
            { type: "input_text", text: `Analyze only visible evidence in these room images, then propose a ${style} redesign shopping plan specifically for this room. Include 6-10 pieces that are visibly retained or explicitly proposed for this room and design. Do not use a generic fixed list. Never invent exact room measurements. ${planContext(context)}` },
            { type: "input_image", image_url: "data:" + imageMime + ";base64," + imageBuffer.toString("base64") },
            ...additionalImages.map(image => ({ type: "input_image", image_url: "data:" + image.mime + ";base64," + image.buffer.toString("base64") }))
          ] }],
          text: {
            format: {
              type: "json_schema",
              name: "room_analysis_and_shopping",
              strict: true,
              schema: { type: "object", additionalProperties: false, properties: fields, required: Object.keys(fields) }
            }
          }
        })
      });
      if (!response.ok) throw new Error("Room analysis returned " + response.status + ": " + (await response.text()).slice(0, 240));
      const payload = await response.json();
      const output = payload.output_text ?? payload.output?.flatMap(item => item.content ?? []).find(item => item.type === "output_text")?.text;
      const analysis = JSON.parse(String(output));
      if (!Array.isArray(analysis.shoppingItems) || analysis.shoppingItems.length < 1) throw new Error("Room analysis returned no shopping items.");
      return analysis;
    } catch (error) {
      failure = error;
      log(`[analysis] attempt ${attempt} failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  throw new Error("Room analysis could not produce a grounded shopping plan: " + (failure instanceof Error ? failure.message : failure));
}

// The semantics behind the three existing variation names. Kept here rather than invented per call
// so the render prompt, the brief, and the report all describe the same three directions.
const conceptDirections = {
  Signature: "balanced, broadly appealing and moderately layered: mid-tone woods, mixed materials, one or two sculptural moments",
  Refined: "quiet, tonal and timeless: lower visual complexity, pale or matte finishes, simple silhouettes, fewer but better pieces",
  Expressive: "bold but practical: stronger contrast, curved or sculptural furniture, a decorative lighting moment, richer textures and a saturated accent"
};

// Produces the shopping brief for ONE variation.
//
// This is what stops the three concepts sharing a single list. They keep the same functional roles
// — the room still needs a sofa, a rug, task lighting — but the specific pieces, materials and
// finishes are asked to differ meaningfully by direction (REQ-5). Falls back to the shared analysis
// brief if the call fails, which degrades to the previous behaviour rather than to nothing.
async function buildConceptBrief(analysis, style, conceptName, context = {}) {
  const shared = sourceShoppingItems(analysis);
  if (!apiKey) return shared;
  const schema = { type: "object", additionalProperties: false, properties: { shoppingItems: shoppingItemsSchema }, required: ["shoppingItems"] };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        model: analysisModel,
        input: `Room analysis: ${JSON.stringify(analysis)}.\n\nThe shared room brief is: ${JSON.stringify(shared)}.\n\nRewrite it as the shopping brief for the "${conceptName}" variation of a ${style} redesign. This direction is ${conceptDirections[conceptName] ?? conceptDirections.Signature}.\n\nKeep the same functional roles the room needs and keep every piece grounded in the photographed room. Change the specific pieces, materials, finishes, silhouettes and priorities so this variation is meaningfully different from the other two — a shopper must be able to see why they are different plans, not the same plan relabelled. Never invent exact room measurements. ${planContext(context)}`,
        text: { format: { type: "json_schema", name: "concept_shopping_brief", strict: true, schema } }
      })
    });
    if (!response.ok) throw new Error(`concept brief returned ${response.status}: ${(await response.text()).slice(0, 180)}`);
    const parsed = JSON.parse(String(responseText(await response.json())));
    return Array.isArray(parsed.shoppingItems) && parsed.shoppingItems.length ? parsed.shoppingItems.slice(0, 10) : shared;
  } catch (error) {
    log(`[brief ${conceptName}] falling back to the shared room brief: ${error instanceof Error ? error.message : error}`);
    return shared;
  }
}

// POST /api/shopping-plan — resolve products for ONE chosen variation (decision A2).
//
// Separating this from /api/design is what lets the plan be concept-specific, budget-aware and
// constraint-aware, and takes the product search off the generation critical path.
function handleShoppingPlanRequest(req, res) {
  let raw = "";
  let tooLarge = false;
  req.on("data", chunk => { raw += chunk; if (raw.length > 20_000_000) tooLarge = true; });
  req.on("end", async () => {
    const started = Date.now();
    if (tooLarge) return send(res, 413, { error: "The shopping plan request is too large." });
    try {
      const { conceptId, conceptName = "Signature", style = "Modern", roomAnalysis, budget, constraints, retainedItems, roomDimensions } = JSON.parse(raw);
      if (!conceptId) return send(res, 400, { error: "conceptId is required." });
      if (!roomAnalysis || typeof roomAnalysis !== "object") return send(res, 400, { error: "roomAnalysis is required. Generate the design before building its shopping plan." });
      const context = { budget, constraints, retainedItems, roomDimensions };
      log(`[shopping-plan ${conceptId}] ${style} ${conceptName} started`);
      const brief = await buildConceptBrief(roomAnalysis, style, conceptName, context);
      const items = await resolveShoppingItems({ ...roomAnalysis, shoppingItems: brief }, style, conceptId, context);
      const unresolvedCount = items.filter(item => item.provenance !== "verified").length;
      const projectedSpend = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      log(`[shopping-plan ${conceptId}] ${items.length} items, ${unresolvedCount} unresolved, $${Math.round(projectedSpend)} in ${Math.round((Date.now() - started) / 1000)}s`);
      send(res, 200, { conceptId, conceptName, items, resolvedAt: new Date().toISOString(), unresolvedCount, projectedSpend: Math.round(projectedSpend * 100) / 100 });
    } catch (error) {
      log(`[shopping-plan] failed after ${Math.round((Date.now() - started) / 1000)}s: ${error instanceof Error ? error.message : error}`);
      send(res, 500, { error: error instanceof Error ? error.message : "The shopping plan could not be built." });
    }
  });
}

function buildDesignReport(analysis, style, name) {
  const focal = analysis.focalPoints?.[0] ?? "the main visible feature";
  const retained = analysis.retainedElements?.join(", ") || "visible windows, flooring, and openings";
  return {
    designDirection: name + " interprets " + style + " around the visible " + analysis.roomType + ", responding to " + focal + " rather than treating the room as a blank canvas.",
    layoutAndCirculation: "The seating group is oriented toward " + focal + ". " + analysis.circulation + " Final positions should be field-checked.",
    colorAndMaterials: "Warm neutrals, natural wood, wool, linen, and restrained metal balance the visible retained surfaces while supporting the " + name.toLowerCase() + " direction.",
    lighting: analysis.lighting + " The plan layers ambient, task, and accent sources for evening use.",
    scaleAndProportion: analysis.proportions + " Proposed dimensions are design targets, not fit claims, until field measurements are checked.",
    retainedElements: "The plan retains and works around " + retained + ".",
    priorityChanges: {
      highestImpact: ["Confirm the furniture layout", "Establish the wall and material palette", "Place the room-anchoring rug"],
      nextBest: ["Layer ambient and task lighting", "Install full-height window treatment"],
      optional: ["Add appropriately scaled art", "Finish with coordinated objects"]
    },
    designerNotes: ["Keep the visible circulation route open.", "Measure the sofa wall and doorway clearance.", "Center the rug on the seating group.", "Repeat the primary wood tone."]
  };
}
function serveDesignImage(req, res) {
  const raw = decodeURIComponent(req.url.slice("/designs/".length));
  const name = basename(raw);
  if (!name || name !== raw) return send(res, 400, { error: "Invalid image path" });
  const path = join(storageDir, name);
  if (!existsSync(path)) return send(res, 404, { error: "Image not found" });
  const contentType = extname(name).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  res.writeHead(200, { "Content-Type": contentType, "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=31536000, immutable" });
  res.end(readFileSync(path));
}
function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS" });
  res.end(JSON.stringify(body));
}

function projectPath(url) {
  const raw = decodeURIComponent(url.slice("/api/projects/".length));
  const id = basename(raw);
  return id && id === raw ? join(projectDir, id + ".json") : undefined;
}
function handleProjectRequest(req, res) {
  const path = projectPath(req.url);
  if (!path) return send(res, 400, { error: "Invalid project id" });
  if (req.method === "GET") return existsSync(path) ? send(res, 200, JSON.parse(readFileSync(path, "utf8"))) : send(res, 404, { error: "Project not found" });
  let raw = "";
  req.on("data", chunk => { raw += chunk; if (raw.length > 50_000_000) req.destroy(); });
  req.on("end", () => {
    try {
      const incoming = JSON.parse(raw);
      const existing = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
      const chosen = existing && Date.parse(existing.updatedAt) > Date.parse(incoming.updatedAt) ? existing : incoming;
      writeFileSync(path, JSON.stringify(chosen));
      send(res, 200, chosen);
    } catch { send(res, 400, { error: "Invalid project payload" }); }
  });
}
// ── POST /api/prices/refresh (REQ-7, REQ-11) ─────────────────────────────────
//
// Re-checks the price and availability of items the user already has, at the SAME product page.
// The rule that makes this safe is the same one the initial search uses: a figure is only accepted
// if the model actually cited the exact URL we asked about. A refresh that quietly re-prices an
// item from some other listing would be worse than no refresh at all.
async function refreshProductPrices(items) {
  const checkedAt = new Date().toISOString();
  const results = [];
  const failed = [];
  const eligible = items.filter(item => isDirectProductUrl(item.purchaseUrl) && isAllowedRetailerSource(item.purchaseUrl));
  for (const item of items) {
    if (!eligible.includes(item)) failed.push({ itemId: item.itemId, reason: "This item has no verified retailer product page to re-check." });
  }
  if (!apiKey || !eligible.length) return { checkedAt, results, failed };

  const schema = {
    type: "object", additionalProperties: false,
    properties: {
      prices: {
        type: "array", maxItems: eligible.length,
        items: {
          type: "object", additionalProperties: false,
          properties: { itemId: { type: "string" }, url: { type: "string" }, currentPrice: { type: "number" }, currency: { type: "string", enum: ["USD"] }, availability: { type: "string" } },
          required: ["itemId", "url", "currentPrice", "currency", "availability"]
        }
      }
    },
    required: ["prices"]
  };

  for (let index = 0; index < eligible.length; index += 3) {
    const batch = eligible.slice(index, index + 3);
    try {
      const search = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(180000),
        body: JSON.stringify({
          model: productSearchModel,
          tools: [{ type: "web_search", search_context_size: "low", user_location: { type: "approximate", country: "US" } }],
          input: `Today is ${checkedAt.slice(0, 10)}. For EACH product page below, open that exact page and report its CURRENT listed USD price and availability. Do not substitute a different product, a different variant, or a different retailer. If a page cannot be read, say so for that item and move on. Items: ${JSON.stringify(batch.map(item => ({ itemId: item.itemId, name: item.name, url: item.purchaseUrl })))}`
        })
      });
      if (!search.ok) throw new Error(`price refresh returned ${search.status}: ${(await search.text()).slice(0, 160)}`);
      const payload = await search.json();
      const parts = (payload.output ?? []).filter(entry => entry.type === "message").flatMap(entry => entry.content ?? []);
      const text = parts.filter(part => part.type === "output_text").map(part => part.text).join("\n");
      const cited = new Set(parts.flatMap(part => part.annotations ?? []).filter(a => a.type === "url_citation").map(a => sourceUrlKey(a.url)));

      const parse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          model: productParseModel,
          input: `Convert this price check into JSON. Use ONLY these itemId/url pairs: ${JSON.stringify(batch.map(item => ({ itemId: item.itemId, url: item.purchaseUrl })))}. Omit any item whose current price was not explicitly stated. Text: ${text.slice(0, 20000)}`,
          text: { format: { type: "json_schema", name: "refreshed_prices", strict: true, schema } }
        })
      });
      if (!parse.ok) throw new Error(`price parse returned ${parse.status}`);
      const parsed = JSON.parse(String(responseText(await parse.json())));
      const seen = new Set();
      for (const price of Array.isArray(parsed.prices) ? parsed.prices : []) {
        const item = batch.find(entry => entry.itemId === price.itemId);
        // Accept only if it is the page we asked about AND the model actually cited it.
        if (!item || sourceUrlKey(price.url) !== sourceUrlKey(item.purchaseUrl) || !cited.has(sourceUrlKey(item.purchaseUrl))) continue;
        if (!Number.isFinite(Number(price.currentPrice)) || Number(price.currentPrice) <= 0 || price.currency !== "USD") continue;
        seen.add(item.itemId);
        results.push({ itemId: item.itemId, observation: { price: Math.round(Number(price.currentPrice) * 100) / 100, currency: "USD", observedAt: checkedAt, availability: price.availability, source: "verified", url: item.purchaseUrl } });
      }
      for (const item of batch) if (!seen.has(item.itemId)) failed.push({ itemId: item.itemId, reason: "The current price could not be confirmed on the product page." });
    } catch (error) {
      log(`[refresh] batch failed: ${error instanceof Error ? error.message : error}`);
      for (const item of batch) failed.push({ itemId: item.itemId, reason: "The retailer could not be reached for this item." });
    }
  }
  return { checkedAt, results, failed };
}

function handlePriceRefreshRequest(req, res) {
  let raw = "";
  let tooLarge = false;
  req.on("data", chunk => { raw += chunk; if (raw.length > 20_000_000) tooLarge = true; });
  req.on("end", async () => {
    const started = Date.now();
    if (tooLarge) return send(res, 413, { error: "The refresh request is too large." });
    try {
      const { projectId, conceptId, items = [], status = "in-progress" } = JSON.parse(raw);
      if (!conceptId) return send(res, 400, { error: "conceptId is required." });
      // A completed project is a historical snapshot. Refused here as well as in the domain, so no
      // caller can reprice it by going straight to the API.
      if (status === "complete") return send(res, 409, { error: "This project is marked complete, so its prices are kept as a record of what you paid. Reopen it to check for changes." });
      if (!Array.isArray(items) || !items.length) return send(res, 400, { error: "No items were supplied to refresh." });
      const { checkedAt, results, failed } = await refreshProductPrices(items.slice(0, 24));
      log(`[refresh ${projectId ?? conceptId}] ${results.length} refreshed, ${failed.length} unavailable in ${Math.round((Date.now() - started) / 1000)}s`);
      send(res, 200, { refreshedAt: checkedAt, conceptId, results, failed });
    } catch (error) {
      log(`[refresh] failed: ${error instanceof Error ? error.message : error}`);
      send(res, 500, { error: error instanceof Error ? error.message : "Prices could not be refreshed." });
    }
  });
}

// ── POST /api/identify-product (REQ-3) ───────────────────────────────────────
//
// Looks at a product photographed in a store and reports what can actually be established from it.
// Every field is optional on purpose: an unknown dimension or price must stay absent rather than be
// invented, and an inferred size is labelled so it cannot be mistaken for a measurement.
function handleIdentifyProductRequest(req, res) {
  let raw = "";
  let tooLarge = false;
  req.on("data", chunk => { raw += chunk; if (raw.length > 50_000_000) tooLarge = true; });
  req.on("end", async () => {
    const started = Date.now();
    if (tooLarge) return send(res, 413, { error: "That photo is too large. Retake it and try again." });
    try {
      const { imageBase64, style = "Modern", action = "replace", userNotes = "", userPrice, roomAnalysis, targetItem } = JSON.parse(raw);
      if (!imageBase64) return send(res, 400, { error: "A photo of the product is required." });
      if (!apiKey) return send(res, 503, { error: "Product identification is not configured. Add OPENAI_API_KEY to the local .env file and restart Tracy’s Room Muse." });
      const buffer = Buffer.from(imageBase64, "base64");
      const info = inputImageInfo(buffer);
      const schema = {
        type: "object", additionalProperties: false,
        properties: {
          productType: { type: "string" },
          category: { type: "string", enum: ["Furniture", "Lighting", "Textiles", "Window treatments", "Finishes", "Art", "Decor"] },
          approximateDimensions: { type: "string" },
          dimensionsConfidence: { type: "string", enum: ["measured", "inferred", "unknown"] },
          compatibility: { type: "string" },
          designImplications: { type: "array", items: { type: "string" } },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          suggestedName: { type: "string" }
        },
        required: ["productType", "category", "approximateDimensions", "dimensionsConfidence", "compatibility", "designImplications", "confidence", "suggestedName"]
      };
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(90000),
        body: JSON.stringify({
          model: analysisModel,
          input: [{ role: "user", content: [
            { type: "input_text", text: `A shopper photographed this product in a store. They want to ${action === "add" ? "ADD it to" : "use it to REPLACE an item in"} their ${style} room design.${targetItem ? ` The item being replaced is: ${JSON.stringify(targetItem)}.` : ""}${roomAnalysis ? ` The room is: ${JSON.stringify(roomAnalysis)}.` : ""}${userNotes ? ` Their notes: ${userNotes}.` : ""}\n\nDescribe what is actually visible. State the product type and category, and whether it suits the room's style, colour, scale and materials, referring to the real room where you can. If the size cannot be established from the photo, set dimensionsConfidence to "unknown" and say so in approximateDimensions rather than guessing a number. NEVER invent a measurement, a price, a brand, or a retailer.` },
            { type: "input_image", image_url: "data:" + info.mime + ";base64," + buffer.toString("base64") }
          ] }],
          text: { format: { type: "json_schema", name: "identified_product", strict: true, schema } }
        })
      });
      if (!response.ok) throw new Error(`identification returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const parsed = JSON.parse(String(responseText(await response.json())));
      const price = Number(userPrice);
      const identified = {
        productType: parsed.productType,
        category: parsed.category,
        approximateDimensions: parsed.dimensionsConfidence === "unknown" ? undefined : parsed.approximateDimensions,
        dimensionsConfidence: parsed.dimensionsConfidence,
        compatibility: parsed.compatibility,
        designImplications: parsed.designImplications,
        // Only the shopper can supply a price here — nothing was verified against a retailer page.
        price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : undefined,
        currency: Number.isFinite(price) && price > 0 ? "USD" : undefined,
        priceSource: Number.isFinite(price) && price > 0 ? "user-entered" : undefined
      };
      log(`[identify] ${parsed.category} ${parsed.confidence} confidence in ${Math.round((Date.now() - started) / 1000)}s`);
      send(res, 200, { identified, suggestedName: parsed.suggestedName, compatibility: parsed.compatibility, designImplications: parsed.designImplications, confidence: parsed.confidence });
    } catch (error) {
      log(`[identify] failed: ${error instanceof Error ? error.message : error}`);
      send(res, 500, { error: error instanceof Error ? error.message : "That product could not be identified." });
    }
  });
}

function handleRefineRequest(req, res) {
  let raw = "";
  let tooLarge = false;
  req.on("data", chunk => { raw += chunk; if (raw.length > 50_000_000) tooLarge = true; });
  req.on("end", async () => {
    const started = Date.now();
    if (tooLarge) return send(res, 413, { error: "The room scan is too large. Retake it and try again." });
    try {
      const { imageBase64, beforeImageUrl, style = "Modern", conceptName = "Signature", instructions = "" } = JSON.parse(raw);
      if (!imageBase64 && !beforeImageUrl) return send(res, 400, { error: "The original room image is required to refine this design." });
      if (!String(instructions).trim()) return send(res, 400, { error: "Describe at least one change before regenerating." });
      const id = randomUUID();
      let input;
      if (imageBase64) input = Buffer.from(imageBase64, "base64");
      else {
        const marker = "/designs/", index = String(beforeImageUrl).indexOf(marker);
        const rawName = index >= 0 ? decodeURIComponent(String(beforeImageUrl).slice(index + marker.length)) : "";
        const name = basename(rawName), path = join(storageDir, name);
        if (!name || name !== rawName || !existsSync(path)) return send(res, 400, { error: "The saved original room image is unavailable. Start a new scan to refine this design." });
        input = readFileSync(path);
      }
      const info = inputImageInfo(input);
      const fileName = `${id}-refined.jpg`;
      log(`[refine ${id}] ${style} ${conceptName} started`);
      const rendered = await renderRoom([{ buffer: input, mime: info.mime }], style, conceptName, instructions);
      writeFileSync(join(storageDir, fileName), rendered);
      const baseUrl = "http://" + req.headers.host;
      log(`[refine ${id}] completed in ${Math.round((Date.now() - started) / 1000)}s`);
      send(res, 200, { imageDataUrl: baseUrl + "/designs/" + fileName, generatedAt: new Date().toISOString(), revisionSummary: String(instructions).trim().slice(0, 1000) });
    } catch (error) {
      log(`[refine] failed after ${Math.round((Date.now() - started) / 1000)}s: ${error instanceof Error ? error.message : error}`);
      send(res, 500, { error: error instanceof Error ? error.message : "Refinement failed" });
    }
  });
}
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, ai: Boolean(apiKey) });
  if (req.method === "GET" && req.url?.startsWith("/designs/")) return serveDesignImage(req, res);
  if ((req.method === "GET" || req.method === "PUT") && req.url?.startsWith("/api/projects/")) return handleProjectRequest(req, res);
  if (req.method === "POST" && req.url === "/api/refine") return handleRefineRequest(req, res);
  if (req.method === "POST" && req.url === "/api/shopping-plan") return handleShoppingPlanRequest(req, res);
  if (req.method === "POST" && req.url === "/api/prices/refresh") return handlePriceRefreshRequest(req, res);
  if (req.method === "POST" && req.url === "/api/identify-product") return handleIdentifyProductRequest(req, res);
  if (req.method !== "POST" || req.url !== "/api/design") return send(res, 404, { error: "Not found" });
  let raw = "";
  let tooLarge = false;
  req.on("data", chunk => { raw += chunk; if (raw.length > 50_000_000) tooLarge = true; });
  req.on("end", async () => {
    const started = Date.now();
    log(`[upload] received ${raw.length} bytes`);
    if (tooLarge) return send(res, 413, { error: "The room scan is too large. Retake it and try again." });
    let beforePath;
    try {
      const { imageBase64, imageBase64s = [], style = "Modern", budget, constraints, retainedItems, roomDimensions } = JSON.parse(raw);
      const context = { budget, constraints, retainedItems, roomDimensions };
      const encodedScans = (Array.isArray(imageBase64s) && imageBase64s.length ? imageBase64s : [imageBase64]).filter(Boolean).slice(0, 3);
      if (!encodedScans.length) return send(res, 400, { error: "At least one room image is required" });
      const id = randomUUID();
      const scans = encodedScans.map(encoded => { const buffer = Buffer.from(encoded, "base64"); return { buffer, ...inputImageInfo(buffer) }; });
      const input = scans[0].buffer;
      const info = scans[0];
      const beforeName = `${id}-before.${info.extension}`;
      const afterName = `${id}-after.jpg`;
      beforePath = join(storageDir, beforeName);
      writeFileSync(beforePath, input);
      log("[design " + id + "] " + style + " started");
      const conceptNames = ["Signature", "Refined", "Expressive"];
      const roomAnalysisPromise = analyzeRoom(input, info.mime, style, scans.slice(1), context);
      const renderPromise = Promise.allSettled(conceptNames.map(conceptName => renderRoom(scans, style, conceptName)));
      const shoppingPromise = roomAnalysisPromise.then(analysis => resolveShoppingItems(analysis, style, id, context));
      const [roomAnalysis, renderResults, shoppingItems] = await Promise.all([roomAnalysisPromise, renderPromise, shoppingPromise]);
      const primary = renderResults[0];
      if (!primary || primary.status === "rejected") throw primary?.reason ?? new Error("The primary design render failed.");
      writeFileSync(join(storageDir, afterName), primary.value);
      const baseUrl = "http://" + req.headers.host;
      const signatureUrl = baseUrl + "/designs/" + afterName;
      const variants = conceptNames.slice(1).map((conceptName, index) => {
        const result = renderResults[index + 1];
        if (result?.status === "fulfilled") {
          const fileName = id + "-" + conceptName.toLowerCase() + ".jpg";
          writeFileSync(join(storageDir, fileName), result.value);
          return { conceptName, imageDataUrl: baseUrl + "/designs/" + fileName, designReport: buildDesignReport(roomAnalysis, style, conceptName), generationStatus: "complete" };
        }
        log(`[design ${id}] ${conceptName} render failed: ${result?.reason instanceof Error ? result.reason.message : result?.reason}`);
        return { conceptName, imageDataUrl: signatureUrl, designReport: buildDesignReport(roomAnalysis, style, conceptName), generationStatus: "partial", fallbackReason: "Secondary render unavailable; showing the generated Signature image until this direction is refined." };
      });
      log("[design " + id + "] completed in " + Math.round((Date.now() - started) / 1000) + "s with " + shoppingItems.length + " room-grounded shopping items");
      send(res, 200, concept(
        style,
        id,
        baseUrl + "/designs/" + beforeName,
        signatureUrl,
        roomAnalysis,
        shoppingItems,
        variants
      ));
    } catch (error) {
      if (beforePath && existsSync(beforePath)) unlinkSync(beforePath);
      log(`[design] failed after ${Math.round((Date.now() - started) / 1000)}s: ${error instanceof Error ? error.message : error}`);
      send(res, 500, { error: error instanceof Error ? error.message : "Design failed" });
    }
  });
});

server.listen(port, "0.0.0.0", () => log(`RoomMuse studio listening on http://0.0.0.0:${port} (${apiKey ? "AI enabled" : "demo mode"})`));
