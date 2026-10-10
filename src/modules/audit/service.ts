import { and, desc, eq, isNull } from "drizzle-orm";
import { db, type DbExecutor } from "../../shared/db";
import { auditLogs, type AuditActorType } from "./schema";

export type AuditEntry = {
  actorType: AuditActorType;
  actorId?: number | null;
  action: string;
  subjectType?: string;
  subjectId?: number | null;
  meta?: Record<string, unknown>;
};

/** Writes an audit trail entry. Never store secrets or full personal data in `meta`. */
export async function recordAudit(entry: AuditEntry, executor?: DbExecutor): Promise<void> {
  await db(executor)
    .insert(auditLogs)
    .values({
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      subjectType: entry.subjectType ?? null,
      subjectId: entry.subjectId ?? null,
      meta: entry.meta ?? {},
    });
}

export async function listAuditForSubject(subjectType: string, subjectId: number, limit = 50) {
  return db()
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.subjectType, subjectType), eq(auditLogs.subjectId, subjectId), isNull(auditLogs.deletedAt)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
