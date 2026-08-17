import { DesignConcept, DesignStyle } from "./types";
import { API_BASE_URL as API_URL } from "./runtimeEnv";

export async function createDesign(photoBase64: string | string[] | undefined, style: DesignStyle): Promise<DesignConcept> {
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: imageBase64s[0], imageBase64s, style: style.name }),
      signal: controller.signal
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error ?? "The design studio is unavailable. Check the server and try again.");
    }
    return response.json() as Promise<DesignConcept>;
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
    const response=await fetch(API_URL+"/api/refine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageBase64,beforeImageUrl,style:style.name,conceptName,instructions}),signal:controller.signal});
    if(!response.ok){const payload=await response.json().catch(()=>({})) as{error?:string};throw new Error(payload.error??"The refinement studio is unavailable. Try again.")}
    return response.json() as Promise<RefinementResult>;
  }catch(error){if(error instanceof Error&&error.name==="AbortError")throw new Error("The refinement took too long. Try again when the connection is stable.");throw error}finally{clearTimeout(timer)}
}
