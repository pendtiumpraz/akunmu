import { getDb } from "../../shared/db";
import { notFound, validationError } from "../../shared/http/errors";
import { IMAGE_TYPES, detectImageType, readStored, removeStored, storage, type StoredFile } from "../../shared/storage";
import { recordAudit } from "../audit/service";
import { findSignInById } from "../signins/repository";
import { deleteProjectLinks, findProjectById, insertProject, listProjects, projectLinks, replaceProjectLinks, updateProjectRow } from "./repository";
import type { ProjectRecord } from "./schema";
import { MAX_SCREENSHOT_BYTES, type ProjectView, type TreeProject } from "./types";
import type { ProjectInput, ProjectUpdateInput } from "./validation";

/**
 * Projects: what the people behind the sessions work on (a website, an app, a video series), each with a screenshot,
 * linked to the login sessions that work on it. The trees hang each project off its sessions.
 */

/** An address the browser can load the screenshot from: the Blob URL, or this app's route for a local file. */
function screenshotAddress(project: ProjectRecord): string | null {
  if (!project.screenshotUrl) return null;
  if (/^https?:\/\//.test(project.screenshotUrl)) return project.screenshotUrl;
  return `/api/projects/${project.id}/screenshot?v=${project.screenshotAt?.getTime() ?? 0}`;
}

export function projectView(project: ProjectRecord, signInIds: number[]): ProjectView {
  return {
    id: project.id,
    name: project.name,
    url: project.url,
    notes: project.notes,
    screenshot: screenshotAddress(project),
    screenshotAt: project.screenshotAt?.toISOString() ?? null,
    signInIds,
  };
}

function linksByProject(links: { projectId: number; signInId: number }[]): Map<number, number[]> {
  const byProject = new Map<number, number[]>();
  for (const link of links) byProject.set(link.projectId, [...(byProject.get(link.projectId) ?? []), link.signInId]);
  return byProject;
}

export async function listProjectsView(): Promise<ProjectView[]> {
  const [rows, links] = await Promise.all([listProjects(), projectLinks()]);
  const byProject = linksByProject(links);
  return rows.map((project) => projectView(project, byProject.get(project.id) ?? []));
}

async function getProject(id: number): Promise<ProjectRecord> {
  const project = await findProjectById(id);
  if (!project) throw notFound();
  return project;
}

export async function projectDetail(id: number): Promise<ProjectView> {
  const project = await getProject(id);
  return projectView(project, (await projectLinks([id])).map((link) => link.signInId));
}

/** Every session given exists in this workspace (signed out ones too: work can be recorded afterwards). */
async function checkSignIns(signInIds: number[]): Promise<number[]> {
  const unique = [...new Set(signInIds)];
  for (const id of unique) {
    if (!(await findSignInById(id))) throw validationError("signInIds", "validation.choice");
  }
  return unique;
}

export async function createProject(input: ProjectInput, actorId: number): Promise<ProjectView> {
  const signInIds = await checkSignIns(input.signInIds);
  const project = await getDb().transaction(async (tx) => {
    const row = await insertProject({ name: input.name, url: input.url ?? null, notes: input.notes ?? null, createdBy: actorId }, tx);
    await replaceProjectLinks(row.id, signInIds, actorId, tx);
    return row;
  });
  await recordAudit({ actorType: "staff", actorId, action: "project.created", subjectType: "project", subjectId: project.id, meta: { sessions: signInIds.length } });
  return projectView(project, signInIds);
}

export async function updateProject(id: number, input: ProjectUpdateInput, actorId: number): Promise<ProjectView> {
  await getProject(id);
  const signInIds = input.signInIds !== undefined ? await checkSignIns(input.signInIds) : undefined;
  const project = await getDb().transaction(async (tx) => {
    const row = await updateProjectRow(
      id,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.url !== undefined ? { url: input.url ?? null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        // Also when only the sessions change: the project was still edited.
        updatedAt: new Date(),
      },
      tx,
    );
    if (signInIds) await replaceProjectLinks(id, signInIds, actorId, tx);
    return row;
  });
  await recordAudit({ actorType: "staff", actorId, action: "project.updated", subjectType: "project", subjectId: id });
  return projectDetail(project.id);
}

const storedOf = (project: ProjectRecord): StoredFile | null =>
  project.screenshotUrl && project.screenshotPath ? { url: project.screenshotUrl, path: project.screenshotPath } : null;

/** Removes a stored screenshot; a file that cannot be removed now does not block the change. */
async function forget(stored: StoredFile | null) {
  if (stored) await removeStored(stored).catch(() => undefined);
}

/** Deletes a project with its links and its screenshot (the file goes for good). */
export async function deleteProject(id: number, actorId: number): Promise<void> {
  const project = await getProject(id);
  await getDb().transaction(async (tx) => {
    await updateProjectRow(id, { deletedAt: new Date(), screenshotUrl: null, screenshotPath: null, screenshotAt: null }, tx);
    await deleteProjectLinks(id, tx);
  });
  await forget(storedOf(project));
  await recordAudit({ actorType: "staff", actorId, action: "project.deleted", subjectType: "project", subjectId: id });
}

/** Stores a new screenshot (JPEG, PNG or WebP, by its signature) and drops the one it replaces. */
export async function setProjectScreenshot(id: number, data: Buffer, actorId: number): Promise<ProjectView> {
  const project = await getProject(id);
  if (data.length > MAX_SCREENSHOT_BYTES) throw validationError("screenshot", "validation.imageTooLarge");
  const type = detectImageType(data);
  if (!type) throw validationError("screenshot", "validation.imageType");
  const stored = await storage().put(`projects/${project.tenantId}/${project.id}.${IMAGE_TYPES[type]}`, data, type);
  await updateProjectRow(id, { screenshotUrl: stored.url, screenshotPath: stored.path, screenshotAt: new Date() });
  await forget(storedOf(project));
  await recordAudit({ actorType: "staff", actorId, action: "project.screenshot", subjectType: "project", subjectId: id, meta: { bytes: data.length } });
  return projectDetail(id);
}

export async function removeProjectScreenshot(id: number, actorId: number): Promise<ProjectView> {
  const project = await getProject(id);
  await updateProjectRow(id, { screenshotUrl: null, screenshotPath: null, screenshotAt: null });
  await forget(storedOf(project));
  await recordAudit({ actorType: "staff", actorId, action: "project.screenshot_removed", subjectType: "project", subjectId: id });
  return projectDetail(id);
}

/** The screenshot to serve: where to redirect (Blob), the bytes of a local file, or null. */
export async function projectScreenshot(id: number): Promise<{ redirect: string } | { data: Buffer; type: string } | null> {
  const project = await getProject(id);
  const stored = storedOf(project);
  if (!stored) return null;
  if (/^https?:\/\//.test(stored.url)) return { redirect: stored.url };
  const data = await readStored(stored);
  const type = data ? detectImageType(data) : null;
  return data && type ? { data, type } : null;
}

/** The projects each session works on, for the trees. */
export async function projectsBySignIn(): Promise<Map<number, TreeProject[]>> {
  const [rows, links] = await Promise.all([listProjects(), projectLinks()]);
  const byId = new Map(rows.map((project) => [project.id, project]));
  const bySignIn = new Map<number, TreeProject[]>();
  for (const link of links) {
    const project = byId.get(link.projectId);
    if (!project) continue;
    const view = { id: project.id, name: project.name, url: project.url, screenshot: screenshotAddress(project) };
    bySignIn.set(link.signInId, [...(bySignIn.get(link.signInId) ?? []), view]);
  }
  return bySignIn;
}

/** Every stored screenshot of the current workspace, to remove with it (the workspace's data deletion). */
export async function workspaceScreenshots(): Promise<StoredFile[]> {
  return (await listProjects()).map(storedOf).filter((stored): stored is StoredFile => stored !== null);
}
