import { and, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { randomString } from "../../shared/crypto/tokens";
import { asPlatform, db, likePattern, softDeleteScope } from "../../shared/db";
import { AppError, notFound } from "../../shared/http/errors";
import { recordAudit } from "../audit/service";
import type { User } from "../users/schema";
import { privacyRequests, type PrivacyRequestRecord } from "./schema";
import { CLOSED_REQUEST_STATUSES, PRIVACY_REQUEST_RECIPIENTS, PRIVACY_REQUEST_STATUSES, PRIVACY_REQUEST_TYPES } from "./types";

/**
 * Data subject requests (UU PDP Art. 5–14). Users file them from Settings → My data, to their workspace's admins
 * or to the AkunMu operator; staff can also record a request received by email. Every request gets the
 * 3 x 24 hour deadline of UU PDP Art. 30, 32, 40 and 41.
 */

const DEADLINE_MS = 72 * 3_600_000;

const description = z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().trim().max(2000).optional());

export const userRequestSchema = z.object({
  recipient: z.enum(PRIVACY_REQUEST_RECIPIENTS),
  requestType: z.enum(PRIVACY_REQUEST_TYPES),
  description,
});

export const staffRequestSchema = z.object({
  requesterName: z.string().trim().min(1).max(120),
  requesterEmail: z.email({ error: "validation.email" }).max(200),
  requestType: z.enum(PRIVACY_REQUEST_TYPES),
  description,
});

export const responseSchema = z.object({
  status: z.enum(PRIVACY_REQUEST_STATUSES),
  response: z.string().trim().max(4000, { error: "validation.tooLong" }).default(""),
});

function newCode(now: Date): string {
  return `DSR-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomString(5)}`;
}

/** Owner condition: a workspace's rows, or the platform's (tenant_id null) in the platform scope. */
function ownedBy(tenantId: number | null): SQL {
  return tenantId === null ? isNull(privacyRequests.tenantId) : eq(privacyRequests.tenantId, tenantId);
}

async function insert(values: typeof privacyRequests.$inferInsert): Promise<PrivacyRequestRecord> {
  const [row] = await db().insert(privacyRequests).values(values).returning();
  return row;
}

/** A request filed by a signed-in user; platform requests are stored without a workspace. */
export async function fileUserRequest(user: Pick<User, "id" | "name" | "email">, tenantId: number, input: z.infer<typeof userRequestSchema>): Promise<PrivacyRequestRecord> {
  const now = new Date();
  const values = {
    code: newCode(now),
    requesterUserId: user.id,
    requesterName: user.name,
    requesterEmail: user.email,
    requestType: input.requestType,
    description: input.description ?? null,
    deadlineAt: new Date(now.getTime() + DEADLINE_MS),
    channel: "app",
  };
  const row =
    input.recipient === "platform"
      ? await asPlatform(() => insert({ ...values, tenantId: null }))
      : await insert({ ...values, tenantId });
  await recordAudit({ actorType: "staff", actorId: user.id, action: "privacy_request.filed", subjectType: "privacy_request", subjectId: row.id, meta: { code: row.code, recipient: input.recipient, type: input.requestType } });
  return row;
}

/** A request staff record on behalf of someone who wrote by email (current scope: workspace or platform). */
export async function recordStaffRequest(tenantId: number | null, input: z.infer<typeof staffRequestSchema>, actorId: number): Promise<PrivacyRequestRecord> {
  const now = new Date();
  const row = await insert({
    tenantId,
    code: newCode(now),
    requesterUserId: null,
    requesterName: input.requesterName,
    requesterEmail: input.requesterEmail.toLowerCase(),
    requestType: input.requestType,
    description: input.description ?? null,
    deadlineAt: new Date(now.getTime() + DEADLINE_MS),
    channel: "staff",
  });
  await recordAudit({ actorType: "staff", actorId, action: "privacy_request.recorded", subjectType: "privacy_request", subjectId: row.id, meta: { code: row.code } });
  return row;
}

export async function listRequests(tenantId: number | null, query: { search?: string; trashed?: boolean; page: number; perPage: number }) {
  const pattern = query.search ? likePattern(query.search) : undefined;
  const where = and(
    ownedBy(tenantId),
    softDeleteScope(privacyRequests.deletedAt, query.trashed),
    pattern ? or(ilike(privacyRequests.code, pattern), ilike(privacyRequests.requesterName, pattern), ilike(privacyRequests.requesterEmail, pattern)) : undefined,
  );
  const [items, [{ total }]] = await Promise.all([
    db().select().from(privacyRequests).where(where).orderBy(desc(privacyRequests.createdAt)).limit(query.perPage).offset((query.page - 1) * query.perPage),
    db().select({ total: count() }).from(privacyRequests).where(where),
  ]);
  return { items, total: Number(total) };
}

/** Open requests of the owner (for the privacy overview). */
export async function countOpenRequests(tenantId: number | null): Promise<number> {
  const rows = await db()
    .select({ status: privacyRequests.status })
    .from(privacyRequests)
    .where(and(ownedBy(tenantId), isNull(privacyRequests.deletedAt)));
  return rows.filter((row) => !CLOSED_REQUEST_STATUSES.includes(row.status)).length;
}

/** The user's own requests: to their workspace (workspace scope) and to the operator (platform scope). */
export async function requestsOfUser(userId: number, tenantId: number): Promise<PrivacyRequestRecord[]> {
  const own = (owner: number | null) =>
    db()
      .select()
      .from(privacyRequests)
      .where(and(ownedBy(owner), eq(privacyRequests.requesterUserId, userId), isNull(privacyRequests.deletedAt)))
      .orderBy(desc(privacyRequests.createdAt));
  // The platform rows are read inside the platform scope (a query builder only runs when awaited).
  const workspace = await own(tenantId);
  const platform = await asPlatform(async () => await own(null));
  return [...workspace, ...platform].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

async function findOwned(tenantId: number | null, id: number, withTrashed = false): Promise<PrivacyRequestRecord> {
  const [row] = await db()
    .select()
    .from(privacyRequests)
    .where(and(ownedBy(tenantId), eq(privacyRequests.id, id), withTrashed ? undefined : isNull(privacyRequests.deletedAt)))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

export async function respondToRequest(tenantId: number | null, id: number, input: z.infer<typeof responseSchema>, actorId: number): Promise<PrivacyRequestRecord> {
  const row = await findOwned(tenantId, id);
  const closing = CLOSED_REQUEST_STATUSES.includes(input.status);
  const [updated] = await db()
    .update(privacyRequests)
    .set({
      status: input.status,
      response: input.response || null,
      respondedAt: input.response ? new Date() : row.respondedAt,
      closedAt: closing ? (row.closedAt ?? new Date()) : null,
      handledBy: actorId,
      updatedAt: new Date(),
    })
    .where(eq(privacyRequests.id, id))
    .returning();
  await recordAudit({ actorType: "staff", actorId, action: "privacy_request.answered", subjectType: "privacy_request", subjectId: id, meta: { code: row.code, status: input.status } });
  return updated;
}

export async function deleteRequest(tenantId: number | null, id: number, actorId: number): Promise<void> {
  const row = await findOwned(tenantId, id);
  if (!row.closedAt) throw new AppError(409, "errors.requestStillOpen");
  await db().update(privacyRequests).set({ deletedAt: new Date() }).where(eq(privacyRequests.id, id));
  await recordAudit({ actorType: "staff", actorId, action: "privacy_request.deleted", subjectType: "privacy_request", subjectId: id });
}

export async function restoreRequest(tenantId: number | null, id: number, actorId: number): Promise<PrivacyRequestRecord> {
  const row = await findOwned(tenantId, id, true);
  if (!row.deletedAt) throw notFound();
  const [restored] = await db().update(privacyRequests).set({ deletedAt: null }).where(eq(privacyRequests.id, id)).returning();
  await recordAudit({ actorType: "staff", actorId, action: "privacy_request.restored", subjectType: "privacy_request", subjectId: id });
  return restored;
}
