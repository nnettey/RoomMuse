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
  const key = Object.keys(fallbackPlans).find(name => name !== "default" && type.includes(name)) ?? "default";
  return fallbackPlans[key].map(([name, category, description, quantity, estimatedUnitPrice]) => ({ name, category, description, quantity, estimatedUnitPrice, dimensions: "Confirm against field measurements", finish: "Coordinate with the selected palette", rationale: `Recommended for the photographed ${analysis.roomType ?? "room"}.`, priority: "High impact", searchQuery: name }));
}
function isDirectProductUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.toLowerCase().replace(/\/+$/, "");
    const blocked = ["/search", "/s/", "/b/", "/keyword", "/collections/", "/category/", "/categories/", "/browse/"];
    if (url.protocol !== "https:" || !hostname.includes(".") || !path || blocked.some(part => path.includes(part)) || ["q", "query", "keyword"].some(key => url.searchParams.has(key))) return false;
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
      ["lampsplus.com", /^\/p\//],
      ["rugsusa.com", /^\/products\//]
    ];
    const retailer = retailerPatterns.find(([domain]) => hostname === domain || hostname.endsWith(`.${domain}`));
    return retailer ? retailer[1].test(path) : true;
  } catch {
    return false;
  }
}
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
async function resolveProductBatch(entries, style) {
  const empty = new Map(entries.map(entry => [entry.requestIndex, []]));
  if (!apiKey || !entries.length) return empty;
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
    const searchResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: process.env.OPENAI_PRODUCT_SEARCH_MODEL ?? "gpt-5-search-api",
        web_search_options: { search_context_size: "medium", user_location: { type: "approximate", approximate: { country: "US" } } },
        messages: [{ role: "user", content: `Today is ${new Date().toISOString().slice(0, 10)}. Find currently purchasable products matching EACH request below for a ${style} room design. Requests: ${JSON.stringify(entries.map(({ requestIndex, raw }) => ({ requestIndex, name: raw.name, category: raw.category, description: raw.description, dimensions: raw.dimensions, finish: raw.finish })))}. Use only these retailers: ${retailerDomains.join(", ")}. Preserve each requestIndex. For each request, find up to three distinct save, balanced, and invest choices when available. State requestIndex, tier, exact product name, retailer, exact product-page URL, current listed USD price, and availability. Cite the exact retailer product page for every product and price. Never use search/category pages, estimates, MSRP substitutions, unrelated products, or uncited claims.` }]
      })
    });
    if (!searchResponse.ok) throw new Error(`product search returned ${searchResponse.status}: ${(await searchResponse.text()).slice(0, 180)}`);
    const searchPayload = await searchResponse.json();
    const message = searchPayload.choices?.[0]?.message;
    const sourceUrls = new Set((message?.annotations ?? [])
      .filter(annotation => annotation.type === "url_citation")
      .map(annotation => annotation.url_citation?.url)
      .filter(url => isDirectProductUrl(url) && isAllowedRetailerSource(url))
      .map(sourceUrlKey));
    if (!sourceUrls.size) return empty;
    const parseResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: process.env.OPENAI_PRODUCT_PARSE_MODEL ?? "gpt-4.1-mini",
        input: `Convert the cited retailer search into the required JSON. Preserve requestIndex and infer tier from explicit labels or relative price. Use ONLY these exact cited product URLs: ${JSON.stringify([...sourceUrls])}. Omit claims without an exact cited URL and numeric current USD price. Search text: ${String(message?.content ?? "").slice(0, 20000)}`,
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
async function resolveShoppingItems(analysis, style, conceptId) {
  const checkedAt = new Date().toISOString();
  const source = sourceShoppingItems(analysis);
  const batches = [];
  for (let index = 0; index < source.length; index += 2) {
    batches.push(source.slice(index, index + 2).map((raw, offset) => ({ requestIndex: index + offset, raw })));
  }
  const resolvedBatches = await Promise.all(batches.map(batch => resolveProductBatch(batch, style)));
  const choicesByIndex = new Map();
  for (const batch of resolvedBatches) for (const [index, choices] of batch) choicesByIndex.set(index, choices);
  const unmatched = source
    .map((raw, requestIndex) => ({ requestIndex, raw }))
    .filter(entry => !(choicesByIndex.get(entry.requestIndex)?.length));
  const fallbackBatches = await Promise.all(unmatched.map(entry => resolveProductBatch([entry], style)));
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
      budgetTier: product.tier
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
      alternatives
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

async function renderRoom(imageBuffer, imageMime, style, conceptName = "Signature", instructions = "") {
  if (!apiKey) throw new Error("AI rendering is not configured yet. Add OPENAI_API_KEY to the local .env file and restart the RoomMuse studio.");
  const direction = conceptName === "Refined"
    ? "quiet, tonal, timeless, and lower in visual complexity"
    : conceptName === "Expressive"
      ? "bold but practical, with sculptural furniture, stronger contrast, and decorative lighting"
      : "balanced, broadly appealing, and moderately layered";
  let failure = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const form = new FormData();
    form.append("model", "gpt-image-2");
    form.append("image", new File([imageBuffer], imageMime === "image/png" ? "room.png" : "room.jpg", { type: imageMime }));
    const refinement = String(instructions).trim().slice(0, 1000);
    form.append("prompt", "Photorealistically redesign this exact room in an elegant " + style + " style as the " + conceptName + " concept: " + direction + ". Preserve architecture, windows, doors, camera, floor, ceiling, and room geometry. Make furniture silhouettes, layout emphasis, lighting, rug, wall and window treatment, materials, accents, art, and decor meaningfully distinct for this direction. Keep circulation practical." + (refinement ? " Apply these user-requested changes: " + refinement + "." : "") + " Do not add text, people, or watermarks.");
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

async function analyzeRoom(imageBuffer, imageMime, style, additionalImages = []) {
  if (!apiKey) return fallbackRoomAnalysis();
  const fields = {
    roomType: { type: "string" },
    proportions: { type: "string" },
    focalPoints: { type: "array", items: { type: "string" } },
    lighting: { type: "string" },
    retainedElements: { type: "array", items: { type: "string" } },
    circulation: { type: "string" },
    confidence: { type: "string" },
    shoppingItems: {
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
    }
  };
  let failure;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          model: process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-4.1-mini",
          input: [{ role: "user", content: [
            { type: "input_text", text: `Analyze only visible evidence in these room images, then propose a ${style} redesign shopping plan specifically for this room. Include 6-10 pieces that are visibly retained or explicitly proposed for this room and design. Do not use a generic fixed list. Never invent exact room measurements.` },
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
      const rendered = await renderRoom(input, info.mime, style, conceptName, instructions);
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
      const { imageBase64, imageBase64s = [], style = "Modern" } = JSON.parse(raw);
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
      const roomAnalysisPromise = analyzeRoom(input, info.mime, style, scans.slice(1));
      const renderPromise = Promise.allSettled(conceptNames.map(conceptName => renderRoom(input, info.mime, style, conceptName)));
      const shoppingPromise = roomAnalysisPromise.then(analysis => resolveShoppingItems(analysis, style, id));
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
