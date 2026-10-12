import { and, asc, count, desc, eq, ilike, isNull, like, or, sql, type AnyColumn } from "drizzle-orm";
import { db, likePattern, softDeleteScope, type DbExecutor } from "../../shared/db";
import { dpiaAssessments, privacyIncidents, processingActivities } from "./schema";

/**
 * Data access for RoPA records, DPIAs and incidents. `tenantId` null means the platform's own records;
 * the explicit owner condition keeps platform-scope queries (which may see every tenant) to those rows.
 */
function ownedBy(column: AnyColumn, tenantId: number | null) {
  return tenantId === null ? isNull(column) : eq(column, tenantId);
}

// ----- processing activities (RoPA) -----

export async function listActivityRecords(tenantId: number | null, executor?: DbExecutor) {
  return db(executor)
    .select()
    .from(processingActivities)
    .where(ownedBy(processingActivities.tenantId, tenantId))
    .orderBy(asc(processingActivities.createdAt));
}

export async function findActivityRecord(tenantId: number | null, key: string, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(processingActivities)
    .where(and(ownedBy(processingActivities.tenantId, tenantId), eq(processingActivities.activityKey, key)))
    .limit(1);
  return row;
}

export async function upsertActivityRecord(
  tenantId: number | null,
  key: string,
  values: Partial<Omit<typeof processingActivities.$inferInsert, "id" | "tenantId" | "activityKey">>,
  executor?: DbExecutor,
) {
  const [row] = await db(executor)
    .insert(processingActivities)
    .values({ ...values, tenantId, activityKey: key })
    .onConflictDoUpdate({
      target: [processingActivities.tenantId, processingActivities.activityKey],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function setActivityDeletedAt(tenantId: number | null, key: string, deletedAt: Date | null, executor?: DbExecutor) {
  const [row] = await db(executor)
    .update(processingActivities)
    .set({ deletedAt })
    .where(and(ownedBy(processingActivities.tenantId, tenantId), eq(processingActivities.activityKey, key)))
    .returning();
  return row;
}

/** Number of custom activities ever created by the owner (for the next RoPA number). */
export async function countCustomActivities(tenantId: number | null, executor?: DbExecutor): Promise<number> {
  const [row] = await db(executor)
    .select({ total: count() })
    .from(processingActivities)
    .where(and(ownedBy(processingActivities.tenantId, tenantId), like(processingActivities.activityKey, "custom-%")));
  return Number(row?.total ?? 0);
}

// ----- DPIA -----

export async function listDpiaRecords(tenantId: number | null, trashed = false, executor?: DbExecutor) {
  return db(executor)
    .select()
    .from(dpiaAssessments)
    .where(and(ownedBy(dpiaAssessments.tenantId, tenantId), softDeleteScope(dpiaAssessments.deletedAt, trashed)))
    .orderBy(desc(dpiaAssessments.updatedAt));
}

/** The DPIA of an activity, including a trashed one (the unique constraint allows one per activity). */
export async function findDpiaRecord(tenantId: number | null, key: string, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(dpiaAssessments)
    .where(and(ownedBy(dpiaAssessments.tenantId, tenantId), eq(dpiaAssessments.activityKey, key)))
    .limit(1);
  return row;
}

export async function insertDpiaRecord(values: typeof dpiaAssessments.$inferInsert, executor?: DbExecutor) {
  const [row] = await db(executor).insert(dpiaAssessments).values(values).returning();
  return row;
}

export async function updateDpiaRecord(id: number, values: Partial<typeof dpiaAssessments.$inferInsert>, executor?: DbExecutor) {
  const [row] = await db(executor)
    .update(dpiaAssessments)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(dpiaAssessments.id, id))
    .returning();
  return row;
}

// ----- incidents -----

export async function listIncidentRecords(
  tenantId: number | null,
  query: { search?: string; trashed?: boolean; page: number; perPage: number },
  executor?: DbExecutor,
) {
  const pattern = query.search ? likePattern(query.search) : undefined;
  const where = and(
    ownedBy(privacyIncidents.tenantId, tenantId),
    softDeleteScope(privacyIncidents.deletedAt, query.trashed),
    pattern ? or(ilike(privacyIncidents.title, pattern), ilike(privacyIncidents.code, pattern)) : undefined,
  );
  const [items, [{ total }]] = await Promise.all([
    db(executor)
      .select()
      .from(privacyIncidents)
      .where(where)
      .orderBy(desc(privacyIncidents.discoveredAt))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db(executor).select({ total: count() }).from(privacyIncidents).where(where),
  ]);
  return { items, total: Number(total) };
}

export async function findIncidentRecord(tenantId: number | null, id: number, options: { withTrashed?: boolean } = {}, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(privacyIncidents)
    .where(
      and(
        ownedBy(privacyIncidents.tenantId, tenantId),
        eq(privacyIncidents.id, id),
        options.withTrashed ? undefined : isNull(privacyIncidents.deletedAt),
      ),
    )
    .limit(1);
  return row;
}

export async function insertIncidentRecord(values: typeof privacyIncidents.$inferInsert, executor?: DbExecutor) {
  const [row] = await db(executor).insert(privacyIncidents).values(values).returning();
  return row;
}

export async function updateIncidentRecord(id: number, values: Partial<typeof privacyIncidents.$inferInsert>, executor?: DbExecutor) {
  const [row] = await db(executor)
    .update(privacyIncidents)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(privacyIncidents.id, id))
    .returning();
  return row;
}

/** Codes already used this year by the owner, to number the next incident. */
export async function countIncidentsInYear(tenantId: number | null, year: number, executor?: DbExecutor): Promise<number> {
  const [row] = await db(executor)
    .select({ total: count() })
    .from(privacyIncidents)
    .where(and(ownedBy(privacyIncidents.tenantId, tenantId), like(privacyIncidents.code, `INC-${year}-%`)));
  return Number(row?.total ?? 0);
}

/** Open incidents whose notification deadline has passed without notifying the subjects or the authority. */
export async function countOverdueIncidents(tenantId: number | null, executor?: DbExecutor): Promise<number> {
  const [row] = await db(executor)
    .select({ total: count() })
    .from(privacyIncidents)
    .where(
      and(
        ownedBy(privacyIncidents.tenantId, tenantId),
        isNull(privacyIncidents.deletedAt),
        isNull(privacyIncidents.closedAt),
        sql`${privacyIncidents.noticeDeadlineAt} < now()`,
        or(isNull(privacyIncidents.subjectsNotifiedAt), isNull(privacyIncidents.authorityNotifiedAt)),
      ),
    );
  return Number(row?.total ?? 0);
}

