import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { baseColumns, referenceColumn, optionalTenantColumn } from "../../shared/db/columns";

export const AUDIT_ACTOR_TYPES = ["staff", "system"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const auditLogs = pgTable(
  "audit_logs",
  {
    ...baseColumns(),
    tenantId: optionalTenantColumn(),
    actorType: text("actor_type").$type<AuditActorType>().notNull(),
    actorId: referenceColumn("actor_id"),
    action: text("action").notNull(),
    subjectType: text("subject_type"),
    subjectId: referenceColumn("subject_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    index("audit_logs_subject_index").on(table.subjectType, table.subjectId),
    index("audit_logs_tenant_created_index").on(table.tenantId, table.createdAt),
  ],
);

export type AuditLogRecord = typeof auditLogs.$inferSelect;
