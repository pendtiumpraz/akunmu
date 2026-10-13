import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, type DbExecutor } from "../../shared/db";
import { projectSessions, projects, type NewProjectRecord } from "./schema";

export async function listProjects(executor?: DbExecutor) {
  return db(executor).select().from(projects).where(isNull(projects.deletedAt)).orderBy(asc(projects.name), asc(projects.id));
}

export async function findProjectById(id: number, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .limit(1);
  return row;
}

export async function insertProject(values: NewProjectRecord, executor?: DbExecutor) {
  const [row] = await db(executor).insert(projects).values(values).returning();
  return row;
}

export async function updateProjectRow(id: number, changes: Partial<NewProjectRecord>, executor?: DbExecutor) {
  const [row] = await db(executor).update(projects).set(changes).where(eq(projects.id, id)).returning();
  return row;
}

/** Which sessions work on which (live) projects; all of them, or those of some projects. */
export async function projectLinks(projectIds?: number[], executor?: DbExecutor) {
  if (projectIds?.length === 0) return [];
  return db(executor)
    .select({ projectId: projectSessions.projectId, signInId: projectSessions.signInId })
    .from(projectSessions)
    .innerJoin(projects, eq(projects.id, projectSessions.projectId))
    .where(and(isNull(projects.deletedAt), projectIds ? inArray(projectSessions.projectId, projectIds) : undefined))
    .orderBy(asc(projectSessions.id));
}

/** Sets the sessions working on a project to exactly these. */
export async function replaceProjectLinks(projectId: number, signInIds: number[], actorId: number, executor?: DbExecutor) {
  await db(executor).delete(projectSessions).where(eq(projectSessions.projectId, projectId));
  if (signInIds.length === 0) return;
  await db(executor)
    .insert(projectSessions)
    .values(signInIds.map((signInId) => ({ projectId, signInId, createdBy: actorId })));
}

export async function deleteProjectLinks(projectId: number, executor?: DbExecutor) {
  await db(executor).delete(projectSessions).where(eq(projectSessions.projectId, projectId));
}
