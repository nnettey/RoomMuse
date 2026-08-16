import AsyncStorage from "@react-native-async-storage/async-storage";
import {normalizeProject,resolveProjectConflict} from "./domain";
import {Project} from "./enhancedTypes";
import {DesignConcept} from "./types";

const KEY="roommuse.project.v2",LIBRARY="roommuse.projects.v1",LEGACY="roommuse.concept";
const API_URL=process.env.EXPO_PUBLIC_API_URL??(typeof window!=="undefined"?`${window.location.protocol}//${window.location.hostname}:8787`:undefined);

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
export async function loadProject(){
  const v=await AsyncStorage.getItem(KEY);
  if(v){
    const local=normalizeProject(JSON.parse(v) as Project);
    if(!API_URL)return local;
    try{const remote=await remoteProject(local.projectId);const merged=remote?resolveProjectConflict(local,remote):local;await AsyncStorage.setItem(KEY,JSON.stringify(merged));return merged}catch{return local}
  }
  const old=await AsyncStorage.getItem(LEGACY);
  if(old)return normalizeProject({concept:JSON.parse(old) as DesignConcept});
}
export async function saveProject(project:Project){
  const stored=await AsyncStorage.getItem(KEY);
  let next=stored?resolveProjectConflict(project,normalizeProject(JSON.parse(stored) as Project)):project;
  await AsyncStorage.setItem(KEY,JSON.stringify(next));
  if(API_URL){
    const remote=await remoteProject(next.projectId);
    if(remote)next=resolveProjectConflict(next,remote);
    next=await pushProject(next);
    await AsyncStorage.setItem(KEY,JSON.stringify(next));
  }
  return next;
}

export async function loadProjects(){const raw=await AsyncStorage.getItem(LIBRARY);const projects=raw?(JSON.parse(raw) as Project[]).map(normalizeProject):[];const current=await loadProject();if(current&&!projects.some(p=>p.projectId===current.projectId))projects.push(current);return projects.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));}
export async function saveToLibrary(project:Project){const saved=await saveProject(project);const projects=await loadProjects();const next=[saved,...projects.filter(p=>p.projectId!==saved.projectId)];await AsyncStorage.setItem(LIBRARY,JSON.stringify(next));return saved;}
