// Multiple saved projects (REQ-6) and the in-progress/complete lifecycle (REQ-7).
//
// The storage primitives already existed in persistence.ts but nothing reachable called them, so
// the app could only ever hold one project. This module is the API the UI actually uses.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { canRefreshPrices, completeProject, normalizeProject, projectStatus, remaining, reopenProject, selected, total } from "./domain";
import { LIBRARY_KEY, loadProject, saveProject, saveToLibrary as persistToLibrary, stripInlineImages } from "./persistence";
import type { Project, ProjectStatus } from "./enhancedTypes";

/** What a project list row needs, without deserialising whole projects into the UI. */
export type ProjectSummary = {
  projectId: string;
  title: string;
  roomName?: string;
  status: ProjectStatus;
  style?: string;
  thumbnailUri?: string;
  planTotal: number;
  remainingToPurchase: number;
  itemCount: number;
  updatedAt: string;
  completedAt?: string;
  refreshable: boolean;
};

async function readLibrary(): Promise<Project[]> {
  const raw = await AsyncStorage.getItem(LIBRARY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Project[];
    return Array.isArray(parsed) ? parsed.map(normalizeProject) : [];
  } catch {
    // A corrupt library must not brick the app. An empty list is recoverable; a thrown parse
    // error on startup is not.
    return [];
  }
}

const writeLibrary = (projects: Project[]) =>
  AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(projects.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))));

/** Every saved project, newest first, including the active one if it is not in the library yet. */
export async function listProjects(): Promise<Project[]> {
  const projects = await readLibrary();
  const current = await loadProject();
  if (current && !projects.some(p => p.projectId === current.projectId)) projects.push(current);
  return projects.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function summarise(project: Project): ProjectSummary {
  const concept = selected(project);
  const items = (concept?.shoppingItems ?? []).filter(item => !item.isRemoved);
  return {
    projectId: project.projectId,
    title: project.roomName ?? concept?.title ?? "Untitled room",
    roomName: project.roomName,
    status: projectStatus(project),
    style: concept?.style ?? project.selectedStyle?.name,
    thumbnailUri: concept?.imageDataUrl ?? concept?.beforeImageUrl ?? project.sourceImages[0]?.uri,
    planTotal: total(items),
    remainingToPurchase: remaining(items),
    itemCount: items.length,
    updatedAt: project.updatedAt,
    completedAt: project.completedAt,
    refreshable: canRefreshPrices(project)
  };
}

export const listSummaries = async (): Promise<ProjectSummary[]> => (await listProjects()).map(summarise);

export async function openProject(projectId: string): Promise<Project | undefined> {
  const project = (await listProjects()).find(p => p.projectId === projectId);
  if (!project) return undefined;
  // Opening makes it the active project so the rest of the app, which still works from a single
  // current project, stays consistent.
  return saveProject(project);
}

/** Save into the library and keep it as the active project. */
export const saveToLibrary = (project: Project): Promise<Project> => persistToLibrary(project);

export async function renameProject(projectId: string, roomName: string): Promise<Project | undefined> {
  const project = (await listProjects()).find(p => p.projectId === projectId);
  if (!project) return undefined;
  return saveToLibrary({ ...project, roomName: roomName.trim() || undefined, updatedAt: new Date().toISOString() });
}

/**
 * Removes a project from the library.
 *
 * The server copy is left alone on purpose: local deletion is a UI action, and quietly destroying
 * the synchronised record would make it unrecoverable. Deleting the active project also clears the
 * active slot so the app does not reopen something the user just removed.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const projects = await readLibrary();
  await writeLibrary(projects.filter(p => p.projectId !== projectId));
  const current = await loadProject();
  if (current?.projectId === projectId) await AsyncStorage.removeItem("roommuse.project.v3");
}

/** In-progress ⇄ complete. Completing snapshots prices; reopening keeps that snapshot (REQ-7). */
export async function setProjectStatus(projectId: string, status: ProjectStatus): Promise<Project | undefined> {
  const project = (await listProjects()).find(p => p.projectId === projectId);
  if (!project) return undefined;
  return saveToLibrary(status === "complete" ? completeProject(project) : reopenProject(project));
}

/**
 * Approximate stored size of a project (risk R8).
 *
 * Projects embed captured photos as base64, so a library of several rooms can grow past what
 * AsyncStorage and the 50 MB sync body will take. Measured rather than assumed — see
 * stripInlineImages for what to do about it.
 */
export const estimatePayloadBytes = (project: Project) => JSON.stringify(project).length;

export { stripInlineImages };
