import { demoConcept } from "./data";
import { DesignConcept, DesignStyle } from "./types";

const API_URL = process.env.EXPO_PUBLIC_API_URL ??
  (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:8787` : "");

export async function createDesign(photoBase64: string | undefined, style: DesignStyle): Promise<DesignConcept> {
  if (!photoBase64) {
    await new Promise(resolve => setTimeout(resolve, 2200));
    return demoConcept(style);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(API_URL + "/api/design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: photoBase64, style: style.name }),
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
