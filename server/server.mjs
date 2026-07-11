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

const port = Number(process.env.PORT ?? 8787);
const apiKey = process.env.OPENAI_API_KEY;
const dataDir = process.env.ROOMMUSE_DATA_DIR ?? join(process.cwd(), "storage");
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

const catalog = [
  ["sofa", "Performance linen sofa", "Furniture", "84-inch, warm ivory upholstery", 1, 1299, "Article", "https://www.article.com/search?q=ivory%20sofa"],
  ["chairs", "Oak accent chair", "Furniture", "Natural oak frame, woven seat", 2, 329, "West Elm", "https://www.westelm.com/search/results.html?words=oak%20accent%20chair"],
  ["table", "Travertine coffee table", "Furniture", "Rounded 40-inch profile", 1, 549, "CB2", "https://www.cb2.com/search?query=travertine%20coffee%20table"],
  ["rug", "Handwoven wool rug", "Textiles", "8 x 10 ft, oatmeal", 1, 489, "Rugs USA", "https://www.rugsusa.com/search?q=oatmeal%20wool%20rug"],
  ["lamp", "Linen floor lamp", "Lighting", "Aged brass with linen shade", 1, 219, "Lamps Plus", "https://www.lampsplus.com/products/?q=linen%20floor%20lamp"],
  ["paint", "Interior wall paint", "Finishes", "2 gallons, warm soft white", 2, 59, "The Home Depot", "https://www.homedepot.com/s/interior%20paint%20warm%20white"],
  ["curtains", "Linen curtain panels", "Textiles", "96-inch, natural flax", 2, 89, "Pottery Barn", "https://www.potterybarn.com/search/results.html?words=linen%20curtain"],
  ["art", "Textured wall art", "Decor", "Neutral 36 x 48-inch canvas", 1, 198, "Etsy", "https://www.etsy.com/search?q=neutral%20textured%20wall%20art"]
].map(([id,name,category,description,quantity,unitPrice,retailer,purchaseUrl]) => ({id,name,category,description,quantity,unitPrice,retailer,purchaseUrl}));

const palettes = {
  Modern: ["#D8CFC0", "#262923", "#F5F2EA"], Contemporary: ["#B8A99A", "#788078", "#F4F0E8"],
  Traditional: ["#6F4E37", "#B69B74", "#E9E0CF"], "Organic Modern": ["#8A9478", "#C4AA88", "#EEE9DE"],
  Scandinavian: ["#D7C8AE", "#AEB7AE", "#FAF8F2"], Japandi: ["#8A7561", "#C9B99F", "#E8E2D7"],
  "Mid-Century Modern": ["#C46F3B", "#48645A", "#E8D5B5"], Transitional: ["#A89C8D", "#4E5B57", "#EEE9E1"],
  "Art Deco": ["#C8A45D", "#173D3A", "#F2E8D5"], Coastal: ["#A8C4C9", "#547A87", "#F3EFE4"],
  Industrial: ["#8B8178", "#3C4140", "#D8C6AA"], Bohemian: ["#B96845", "#7B7751", "#E9D2B7"],
  "French Country": ["#9BA79A", "#6D7B8B", "#EFE4D2"]
};

function concept(style, id, beforeImageUrl, imageDataUrl, roomAnalysis, variants = []) {
  return { id, title: style + " Signature", style, beforeImageUrl, imageDataUrl,
    summary: "A room-grounded " + style.toLowerCase() + " direction with deliberate layout, lighting, materials, and pieces.",
    palette: palettes[style] ?? palettes.Modern,
    principles: ["Preserve visible circulation", "Coordinate materials across the complete room", "Layer ambient, task, and accent lighting"],
    shoppingItems: catalog,
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

async function analyzeRoom(imageBuffer, imageMime) {
  if (!apiKey) return fallbackRoomAnalysis();
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-4.1-mini",
        input: [{ role: "user", content: [
          { type: "input_text", text: "Analyze only visible evidence in this room photo. Return only JSON with roomType, proportions, focalPoints array, lighting, retainedElements array, circulation, confidence. Never invent measurements." },
          { type: "input_image", image_url: "data:" + imageMime + ";base64," + imageBuffer.toString("base64") }
        ] }]
      })
    });
    if (!response.ok) throw new Error("Room analysis returned " + response.status);
    const payload = await response.json();
    const text = payload.output_text ?? payload.output?.flatMap(item => item.content ?? []).find(item => item.type === "output_text")?.text;
    const json = String(text).replace(/^[^{]*/, "").replace(/[^}]*$/, "");
    return { ...fallbackRoomAnalysis(), ...JSON.parse(json) };
  } catch (error) {
    log("[analysis] optional room analysis failed: " + (error instanceof Error ? error.message : error));
    return fallbackRoomAnalysis();
  }
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
      const { imageBase64, style = "Modern" } = JSON.parse(raw);
      if (!imageBase64) return send(res, 400, { error: "imageBase64 is required" });
      const id = randomUUID();
      const input = Buffer.from(imageBase64, "base64");
      const info = inputImageInfo(input);
      const beforeName = `${id}-before.${info.extension}`;
      const afterName = `${id}-after.jpg`;
      beforePath = join(storageDir, beforeName);
      writeFileSync(beforePath, input);
      log("[design " + id + "] " + style + " started");
      const [roomAnalysis, rendered] = await Promise.all([
        analyzeRoom(input, info.mime),
        renderRoom(input, info.mime, style, "Signature")
      ]);
      writeFileSync(join(storageDir, afterName), rendered);
      const baseUrl = "http://" + req.headers.host;
      const signatureUrl = baseUrl + "/designs/" + afterName;
      const variants = [];
      for (const conceptName of ["Refined", "Expressive"]) {
        try {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const secondaryImage = await renderRoom(input, info.mime, style, conceptName);
          const fileName = id + "-" + conceptName.toLowerCase() + ".jpg";
          writeFileSync(join(storageDir, fileName), secondaryImage);
          variants.push({ conceptName, imageDataUrl: baseUrl + "/designs/" + fileName, designReport: buildDesignReport(roomAnalysis, style, conceptName), generationStatus: "complete" });
        } catch (error) {
          log(`[design ${id}] ${conceptName} render failed: ${error instanceof Error ? error.message : error}`);
          variants.push({ conceptName, imageDataUrl: signatureUrl, designReport: buildDesignReport(roomAnalysis, style, conceptName), generationStatus: "partial", fallbackReason: "Secondary render unavailable; showing the generated Signature image until this direction is refined." });
        }
      }
      log("[design " + id + "] completed in " + Math.round((Date.now() - started) / 1000) + "s");
      send(res, 200, concept(
        style,
        id,
        baseUrl + "/designs/" + beforeName,
        baseUrl + "/designs/" + afterName,
        roomAnalysis,
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

