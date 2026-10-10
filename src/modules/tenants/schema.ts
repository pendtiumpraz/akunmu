import { sql } from "drizzle-orm";
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns, referenceColumn } from "../../shared/db/columns";
import type { TenantStatus } from "./types";

export { TENANT_STATUSES, type TenantStatus } from "./types";

/**
 * A workspace on AkunMu: a person or a team keeping their sign-in map (SaaS customer, or the single
 * workspace of an on-premise install). Every tenant-owned row carries its id; row level security keeps
 * workspaces apart.
 */
export const tenants = pgTable(
  "tenants",
  {
    ...baseColumns(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    contactEmail: text("contact_email").notNull(),
    status: text("status").$type<TenantStatus>().notNull().default("active"),
    locale: text("locale"),
    createdBy: referenceColumn("created_by"),
  },
  (table) => [uniqueIndex("tenants_slug_active_unique").on(table.slug).where(sql`${table.deletedAt} is null`)],
);

export type TenantRecord = typeof tenants.$inferSelect;
export type NewTenantRecord = typeof tenants.$inferInsert;
