import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns, referenceColumn, tenantColumn } from "../../shared/db/columns";
import type { FindingKind, FindingPayload, FindingStatus, LastReport } from "./types";

/**
 * A key the browser extension (or another agent) reports with, for one device of the workspace. Only its SHA-256 hash
 * is stored; the key itself is shown once, when it is made.
 */
export const ingestTokens = pgTable(
  "ingest_tokens",
  {
    ...baseColumns(),
    tenantId: tenantColumn(),
    deviceId: referenceColumn("device_id").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    /** The key's last characters, to tell keys apart in lists. */
    hint: text("hint").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    /** Who reported last and from where: agent, version, browser, profile name. */
    lastReport: jsonb("last_report").$type<LastReport>(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: referenceColumn("created_by"),
  },
  (table) => [uniqueIndex("ingest_tokens_hash_unique").on(table.tokenHash), index("ingest_tokens_tenant_index").on(table.tenantId)],
);

/** Something an agent saw that the map does not have yet, waiting for the owner's yes or no. */
export const findings = pgTable(
  "findings",
  {
    ...baseColumns(),
    tenantId: tenantColumn(),
    deviceId: referenceColumn("device_id"),
    tokenId: referenceColumn("token_id"),
    kind: text("kind").$type<FindingKind>().notNull(),
    /** The same thing seen again has the same fingerprint (per workspace): it refreshes the finding instead of adding one. */
    fingerprint: text("fingerprint").notNull(),
    payload: jsonb("payload").$type<FindingPayload>().notNull(),
    status: text("status").$type<FindingStatus>().notNull().default("new"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: referenceColumn("resolved_by"),
  },
  (table) => [
    uniqueIndex("findings_tenant_fingerprint_unique").on(table.tenantId, table.fingerprint),
    index("findings_tenant_status_index").on(table.tenantId, table.status),
  ],
);

export type IngestTokenRecord = typeof ingestTokens.$inferSelect;
export type NewIngestTokenRecord = typeof ingestTokens.$inferInsert;
export type FindingRecord = typeof findings.$inferSelect;
export type NewFindingRecord = typeof findings.$inferInsert;
