import AsyncStorage from "@react-native-async-storage/async-storage";
import {normalizeProject,resolveProjectConflict} from "./domain";
import {Project} from "./enhancedTypes";
import {DesignConcept} from "./types";
import{API_BASE_URL as API_URL}from"./runtimeEnv";

// Storage keys, newest first. Older keys stay READABLE and are never deleted: that is what keeps
// a rollback to a previous build non-destructive, and it is a guarantee docs/CURRENT_CONTRACTS.md
// already made. Migration is additive and idempotent.
const KEY="roommuse.project.v3",KEY_V2="roommuse.project.v2",LEGACY="roommuse.concept";
export const LIBRARY_KEY="roommuse.projects.v3";
const LIBRARY_V1="roommuse.projects.v1";

async function request(path:string,init?:RequestInit){
  if(!API_URL)return undefined;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),5000);
  try{return await fetch(API_URL+path,{...init,signal:controller.signal})}finally{clearTimeout(timer)}
}
async function remoteProject(id:string){
  const response=await request("/api/projects/"+encodeURIComponent(id));
  if(!response||response.status===404)return undefined;
  if(!response.ok)throw new Error("Project synchronization is temporarily unavailable.");
  return normalizeProject(await response.json() as Project);
}
async function pushProject(project:Project){
  const response=await request("/api/projects/"+encodeURIComponent(project.projectId),{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(project)});
  if(!response)return project;
  if(!response.ok)throw new Error("Project synchronization is temporarily unavailable.");
  return normalizeProject(await response.json() as Project);
}

/**
 * Reads the newest stored record, migrating older shapes forward.
 *
 * normalizeProject supplies every v3 default, so migration is simply "read the best available
 * record and write it back under the current key". Running it twice is harmless, and a
 * half-migrated store still resolves because each older key is still consulted in order.
 */
async function readStored():Promise<Project|undefined>{
  const current=await AsyncStorage.getItem(KEY);
  if(current)return normalizeProject(JSON.parse(current) as Project);
  const v2=await AsyncStorage.getItem(KEY_V2);
  if(v2){
    const migrated=normalizeProject(JSON.parse(v2) as Project);
    await AsyncStorage.setItem(KEY,JSON.stringify(migrated));   // v2 is deliberately left in place
    return migrated;
  }
  const legacy=await AsyncStorage.getItem(LEGACY);
  if(legacy){
    const migrated=normalizeProject({concept:JSON.parse(legacy) as DesignConcept});
    await AsyncStorage.setItem(KEY,JSON.stringify(migrated));
    return migrated;
  }
  return undefined;
}

export async function loadProject(){
  const local=await readStored();
  if(!local)return undefined;
  if(!API_URL)return local;
  try{
    const remote=await remoteProject(local.projectId);
    const merged=remote?resolveProjectConflict(local,remote):local;
    await AsyncStorage.setItem(KEY,JSON.stringify(merged));
    return merged;
  }catch{return local}
}

/** The most recent optional-sync failure, if any. Nothing depends on it; it exists so a screen can
 *  report the state honestly without a failed sync blocking a save. */
let lastSyncError:string|undefined;
export const projectSyncError=()=>lastSyncError;

export async function saveProject(project:Project){
  const stored=await AsyncStorage.getItem(KEY);
  let next=stored?resolveProjectConflict(project,normalizeProject(JSON.parse(stored) as Project)):project;
  await AsyncStorage.setItem(KEY,JSON.stringify(next));
  if(API_URL){
    try{
      const remote=await remoteProject(next.projectId);
      if(remote)next=resolveProjectConflict(next,remote);
      next=await pushProject(next);
      await AsyncStorage.setItem(KEY,JSON.stringify(next));
      lastSyncError=undefined;
    }catch(error){
      // Recorded rather than thrown: the project is already saved on this device, and an optional
      // sync is not worth interrupting the user or losing the library entry over.
      lastSyncError=error instanceof Error?error.message:"Project synchronization is unavailable.";
    }
  }
  return next;
}

/**
 * Every saved project. Reads the v3 library and folds in a v1 library once, so a user upgrading
 * mid-project does not appear to lose their saved rooms.
 */
export async function loadProjects(){
  const parse=(raw:string|null)=>{try{const value=raw?JSON.parse(raw) as Project[]:[];return Array.isArray(value)?value.map(normalizeProject):[]}catch{return []}};
  const projects=parse(await AsyncStorage.getItem(LIBRARY_KEY));
  if(!projects.length){
    const inherited=parse(await AsyncStorage.getItem(LIBRARY_V1));
    if(inherited.length)await AsyncStorage.setItem(LIBRARY_KEY,JSON.stringify(inherited));
    projects.push(...inherited);
  }
  const current=await loadProject();
  if(current&&!projects.some(p=>p.projectId===current.projectId))projects.push(current);
  return projects.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
}

/**
 * Drops inline base64 photos when the same image is already served from /designs/.
 *
 * Measured: a project with three captured photos is ~825 KB inline but ~33 KB by reference, so a
 * library of eight rooms would breach the ~6 MB AsyncStorage ceiling on Android — while REQ-6
 * requires multiple saved projects. The server writes the original scan to disk and returns
 * beforeImageUrl, and both the refine flow and the comparison view already fall back to that URL,
 * so the inline copy is redundant weight.
 *
 * Photos with no server-side counterpart are left untouched: losing the only copy of a scan would
 * be far worse than the storage cost.
 */
export function stripInlineImages(project:Project):Project{
  // Only the FIRST scan is written server-side — /api/design saves scans[0] as "<id>-before.<ext>"
  // and that is what beforeImageUrl points at. The second and third angles have no server copy at
  // all, so dropping their base64 here made them unrecoverable once the device's local file URI
  // expired: the user could reopen a saved project and find two of their three photos gone (F18),
  // and refinement lost the extra views that S-1 showed are what make the render see the real room.
  //
  // So strip exactly what is provably held elsewhere and nothing more. This costs storage — roughly
  // 275 KB per retained photo against the ~6 MB AsyncStorage ceiling measured in R8 — which is the
  // right trade against losing a photo the user cannot retake. Persisting every scan server-side
  // would recover that space; recorded as a follow-up rather than done here.
  if(!project.concepts.some(concept=>Boolean(concept.beforeImageUrl)))return project;
  return{...project,sourceImages:project.sourceImages.map((image,index)=>index===0&&image.base64?{...image,base64:undefined}:image)};
}

/**
 * Saves as the active project and records it in the library.
 * The active copy keeps its inline photos so refinement can reuse them; the library copy is
 * stored by reference so a shelf of saved rooms stays within the storage budget.
 */
export async function saveToLibrary(project:Project){
  const saved=await saveProject(project);
  const projects=await loadProjects();
  const next=[stripInlineImages(saved),...projects.filter(p=>p.projectId!==saved.projectId)];
  await AsyncStorage.setItem(LIBRARY_KEY,JSON.stringify(next));
  return saved;
}
