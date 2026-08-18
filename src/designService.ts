import { DesignConcept, DesignStyle } from "./types";
import { API_BASE_URL as API_URL, apiHeaders } from "./runtimeEnv";

/** What the server is actually doing right now, as opposed to what a timer guessed. */
export type Stage = { stage: string; detail?: string; elapsedMs?: number };
type JobState = Stage & { done?: boolean; result?: unknown; error?: string };

/**
 * Follow a job to completion.
 *
 * Polling rather than streaming: React Native's fetch has no reliable streaming support, and polling
 * behaves identically on the device and in a browser. A server that answered inline instead of
 * handing back a job — which is what the e2e fixtures do — never reaches this.
 */
async function followJob<T>(jobId: string, onStage?: (stage: Stage) => void, timeoutMs = 300_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let missed = 0;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    let state: JobState | undefined;
    try {
      const response = await fetch(API_URL + "/api/jobs/" + encodeURIComponent(jobId), { headers: apiHeaders() });
      if (response.status === 404) throw new Error("The job is no longer available. Try again.");
      if (!response.ok) { missed += 1; if (missed > 5) throw new Error("Lost contact with the studio. Try again."); continue; }
      state = await response.json() as JobState;
      missed = 0;
    } catch (error) {
      // A dropped poll is not a failed job — the work continues on the server. Give up only after
      // several consecutive misses, so a brief network blip does not discard a minute of work.
      missed += 1;
      if (missed > 5) throw error instanceof Error ? error : new Error("Lost contact with the studio.");
      continue;
    }
    if (state.stage) onStage?.({ stage: state.stage, detail: state.detail, elapsedMs: state.elapsedMs });
    if (state.error) throw new Error(state.error);
    if (state.done) return state.result as T;
  }
  throw new Error("The studio took too long to respond. Try again when your connection is stable.");
}

export async function createDesign(photoBase64: string | string[] | undefined, style: DesignStyle, onStage?: (stage: Stage) => void): Promise<DesignConcept> {
  const imageBase64s = Array.isArray(photoBase64) ? photoBase64.filter(Boolean).slice(0, 3) : photoBase64 ? [photoBase64] : [];
  // Without a room image there is nothing to ground a design in. This used to return a seeded demo
  // concept after a fake 2.2s delay, which is indistinguishable from a real result in the UI and is
  // exactly the fabricated-data path REQ-11 forbids. Fail honestly instead.
  if (!imageBase64s.length) {
    throw new Error("The room photo could not be read. Retake the scan and try again.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 360_000);
  try {
    const response = await fetch(API_URL + "/api/design", {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      // async asks for a job so the wait can report what is really happening. A server or fixture
      // that answers inline is handled below, so nothing has to change on that side.
      body: JSON.stringify({ imageBase64: imageBase64s[0], imageBase64s, style: style.name, async: true }),
      signal: controller.signal
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error ?? "The design studio is unavailable. Check the server and try again.");
    }
    const payload = await response.json() as DesignConcept & { jobId?: string };
    return payload.jobId ? followJob<DesignConcept>(payload.jobId, onStage, 360_000) : payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The design studio took too long to respond. Try again when your connection is stable.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }}

export type RefinementResult={imageDataUrl:string;generatedAt:string;revisionSummary:string};
export async function refineDesign(imageBase64:string|undefined,style:DesignStyle,conceptName:string,instructions:string,beforeImageUrl?:string):Promise<RefinementResult>{
  if(!imageBase64&&!beforeImageUrl)throw new Error("The original room image is unavailable. Start a new scan to refine this design.");
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),240_000);
  try{
    const response=await fetch(API_URL+"/api/refine",{method:"POST",headers:apiHeaders({"Content-Type":"application/json"}),body:JSON.stringify({imageBase64,beforeImageUrl,style:style.name,conceptName,instructions}),signal:controller.signal});
    if(!response.ok){const payload=await response.json().catch(()=>({})) as{error?:string};throw new Error(payload.error??"The refinement studio is unavailable. Try again.")}
    return response.json() as Promise<RefinementResult>;
  }catch(error){if(error instanceof Error&&error.name==="AbortError")throw new Error("The refinement took too long. Try again when the connection is stable.");throw error}finally{clearTimeout(timer)}
}

// ── Shopping plan for one chosen variation (REQ-2, REQ-5, REQ-10) ────────────
export type ShoppingPlanRequest={conceptId:string;conceptName:string;style:DesignStyle;roomAnalysis:unknown;budget?:{total:number;currency:"USD"};constraints?:{id:string;kind:string;label:string;releasedAt?:string}[];retainedItems?:string[];roomDimensions?:string};
export type ShoppingPlanResult={conceptId:string;conceptName:string;items:unknown[];resolvedAt:string;unresolvedCount:number;projectedSpend:number};
export async function buildShoppingPlan(request:ShoppingPlanRequest,onStage?:(stage:Stage)=>void):Promise<ShoppingPlanResult>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),300_000);
  try{
    const response=await fetch(API_URL+"/api/shopping-plan",{method:"POST",headers:apiHeaders({"Content-Type":"application/json"}),signal:controller.signal,
      body:JSON.stringify({...request,style:request.style.name,async:true})});
    if(!response.ok){const payload=await response.json().catch(()=>({})) as{error?:string};throw new Error(payload.error??"The shopping plan could not be built. Try again.")}
    const payload=await response.json() as ShoppingPlanResult&{jobId?:string};
    return payload.jobId?followJob<ShoppingPlanResult>(payload.jobId,onStage,300_000):payload;
  }catch(error){
    if(error instanceof Error&&error.name==="AbortError")throw new Error("Building the shopping plan took too long. Try again when your connection is stable.");
    throw error;
  }finally{clearTimeout(timer)}
}

// ── Price refresh (REQ-7) ────────────────────────────────────────────────────
export type RefreshResult={refreshedAt:string;conceptId:string;results:{itemId:string;observation:{price:number;currency:"USD";observedAt:string;availability?:string;source:"verified";url?:string}}[];failed:{itemId:string;reason:string}[]};
export async function refreshPrices(input:{projectId:string;conceptId:string;status:string;items:{itemId:string;name:string;purchaseUrl:string;unitPrice:number}[]}):Promise<RefreshResult>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),300_000);
  try{
    const response=await fetch(API_URL+"/api/prices/refresh",{method:"POST",headers:apiHeaders({"Content-Type":"application/json"}),signal:controller.signal,body:JSON.stringify(input)});
    if(!response.ok){const payload=await response.json().catch(()=>({})) as{error?:string};throw new Error(payload.error??"Prices could not be refreshed right now.")}
    return response.json() as Promise<RefreshResult>;
  }catch(error){
    if(error instanceof Error&&error.name==="AbortError")throw new Error("The price check took too long. Try again when your connection is stable.");
    throw error;
  }finally{clearTimeout(timer)}
}

// ── In-store product identification (REQ-3) ──────────────────────────────────
export type IdentifyResult={identified:{productType?:string;category?:string;approximateDimensions?:string;dimensionsConfidence?:"measured"|"inferred"|"unknown";compatibility?:string;designImplications?:string[];price?:number;currency?:"USD";priceSource?:"user-entered"|"discovered"};suggestedName:string;compatibility:string;designImplications:string[];confidence:"high"|"medium"|"low"};
export async function identifyProduct(input:{imageBase64:string;style?:string;action:"replace"|"add";userNotes?:string;userPrice?:number;roomAnalysis?:unknown;targetItem?:unknown}):Promise<IdentifyResult>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180_000);
  try{
    const response=await fetch(API_URL+"/api/identify-product",{method:"POST",headers:apiHeaders({"Content-Type":"application/json"}),signal:controller.signal,body:JSON.stringify(input)});
    if(!response.ok){const payload=await response.json().catch(()=>({})) as{error?:string};throw new Error(payload.error??"That product could not be identified. Try another photo.")}
    return response.json() as Promise<IdentifyResult>;
  }catch(error){
    if(error instanceof Error&&error.name==="AbortError")throw new Error("Checking that product took too long. Try again when your connection is stable.");
    throw error;
  }finally{clearTimeout(timer)}
}
