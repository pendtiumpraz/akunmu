import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { asPlatform, db, inTenant } from "../../shared/db";
import { aiActions, aiConversations, aiMessages } from "../ai/schema";
import { recordAudit } from "../audit/service";
import { auditLogs } from "../audit/schema";
import { findings, ingestTokens } from "../connect/schema";
import { rateLimits } from "../security/schema";
import { signIns } from "../signins/schema";
import { allTenantIds } from "../tenants/service";
import { staffSessions } from "../users/schema";
import { loadRetentionPolicy } from "./profile";

/**
 * Retention (UU PDP Art. 42–44; PP 33/2026 Art. 75 and 80): ends processing once the period each owner set
 * has passed. Runs from the daily cron. Every period is off until staff set it, so nothing is deleted by
 * surprise; batches are bounded so one run stays within the function time limit.
 *
 * - workspaces: delete processed extension findings, signed-out sessions and inactive assistant conversations;
 * - platform: delete audit log entries older than N days, plus expired attempt counters, expired sessions and
 *   device keys revoked long ago.
 */

const BATCH = 500;
const DAY_MS = 86_400_000;
const REVOKED_KEY_DAYS = 30;

export type RetentionReport = {
  workspaces: number;
  findingsDeleted: number;
  signInsDeleted: number;
  conversationsDeleted: number;
  auditDeleted: number;
  rateLimitsDeleted: number;
  sessionsDeleted: number;
  revokedKeysDeleted: number;
};

function before(days: number, now: Date): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

async function deleteProcessedFindings(days: number, now: Date): Promise<number> {
  const rows = await db()
    .select({ id: findings.id })
    .from(findings)
    .where(and(inArray(findings.status, ["accepted", "dismissed"]), isNotNull(findings.resolvedAt), lt(findings.resolvedAt, before(days, now))))
    .limit(BATCH);
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return 0;
  await db().delete(findings).where(inArray(findings.id, ids));
  await recordAudit({ actorType: "system", action: "connect.findings_purged", subjectType: "finding", meta: { count: ids.length } });
  return ids.length;
}

async function deleteSignedOutSessions(days: number, now: Date): Promise<number> {
  const rows = await db()
    .select({ id: signIns.id })
    .from(signIns)
    .where(and(eq(signIns.status, "signed_out"), isNotNull(signIns.signedOutAt), lt(signIns.signedOutAt, before(days, now))))
    .limit(BATCH);
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return 0;
  // Sessions approved from a deleted one keep living; they simply lose the link to their origin.
  await db().update(signIns).set({ approvedFromId: null }).where(inArray(signIns.approvedFromId, ids));
  await db().delete(signIns).where(inArray(signIns.id, ids));
  await recordAudit({ actorType: "system", action: "signins.history_purged", subjectType: "sign_in", meta: { count: ids.length } });
  return ids.length;
}

async function deleteStaleConversations(days: number, now: Date): Promise<number> {
  const rows = await db().select({ id: aiConversations.id }).from(aiConversations).where(lt(aiConversations.lastMessageAt, before(days, now))).limit(BATCH);
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return 0;
  await db().delete(aiActions).where(inArray(aiActions.conversationId, ids));
  await db().delete(aiMessages).where(inArray(aiMessages.conversationId, ids));
  await db().delete(aiConversations).where(inArray(aiConversations.id, ids));
  await recordAudit({ actorType: "system", action: "ai.conversations_purged", subjectType: "ai_conversation", meta: { count: ids.length } });
  return ids.length;
}

/** Applies one workspace's retention policy (call inside that workspace's scope). */
export async function runTenantRetention(now = new Date()) {
  const policy = await loadRetentionPolicy();
  return {
    findingsDeleted: policy.findingDays ? await deleteProcessedFindings(policy.findingDays, now) : 0,
    signInsDeleted: policy.signedOutDays ? await deleteSignedOutSessions(policy.signedOutDays, now) : 0,
    conversationsDeleted: policy.aiDays ? await deleteStaleConversations(policy.aiDays, now) : 0,
  };
}

/** Platform cleanup (call inside the platform scope): audit log retention, expired counters, sessions and keys. */
export async function runPlatformRetention(now = new Date()) {
  const policy = await loadRetentionPolicy();
  const yesterday = before(1, now);
  const rateLimitsDeleted = (await db().delete(rateLimits).where(lt(rateLimits.resetAt, yesterday)).returning({ id: rateLimits.id })).length;
  const sessionsDeleted = (await db().delete(staffSessions).where(lt(staffSessions.expiresAt, yesterday)).returning({ id: staffSessions.id })).length;
  const revokedKeysDeleted = (
    await db()
      .delete(ingestTokens)
      .where(and(isNotNull(ingestTokens.revokedAt), lt(ingestTokens.revokedAt, before(REVOKED_KEY_DAYS, now))))
      .returning({ id: ingestTokens.id })
  ).length;
  let auditDeleted = 0;
  if (policy.auditDays) {
    auditDeleted = (await db().delete(auditLogs).where(lt(auditLogs.createdAt, before(policy.auditDays, now))).returning({ id: auditLogs.id })).length;
  }
  return { rateLimitsDeleted, sessionsDeleted, revokedKeysDeleted, auditDeleted };
}

/** The daily run over every workspace, then the platform. */
export async function runRetentionForAll(now = new Date()): Promise<RetentionReport> {
  const report: RetentionReport = {
    workspaces: 0,
    findingsDeleted: 0,
    signInsDeleted: 0,
    conversationsDeleted: 0,
    auditDeleted: 0,
    rateLimitsDeleted: 0,
    sessionsDeleted: 0,
    revokedKeysDeleted: 0,
  };
  const tenantIds = await asPlatform(() => allTenantIds());
  for (const tenantId of tenantIds) {
    try {
      const result = await inTenant(tenantId, () => runTenantRetention(now));
      report.workspaces += 1;
      report.findingsDeleted += result.findingsDeleted;
      report.signInsDeleted += result.signInsDeleted;
      report.conversationsDeleted += result.conversationsDeleted;
    } catch (error) {
      console.error("[retention] workspace run failed", tenantId, error);
    }
  }
  const platform = await asPlatform(() => runPlatformRetention(now));
  return { ...report, ...platform };
}
