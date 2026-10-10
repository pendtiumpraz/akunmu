import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns, referenceColumn, tenantColumn } from "../../shared/db/columns";
import type { TwoFactorState } from "./types";

/** Who an account is with (Google, GitHub, …): the built-in list plus the workspace's own. */
export const providers = pgTable(
  "providers",
  {
    ...baseColumns(),
    tenantId: tenantColumn(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    domain: text("domain"),
    color: text("color").notNull().default("#64748b"),
    builtIn: boolean("built_in").notNull().default(false),
  },
  (table) => [uniqueIndex("providers_tenant_slug_unique").on(table.tenantId, table.slug).where(sql`${table.deletedAt} is null`)],
);

/**
 * An account at a provider, by the name it signs in with (email, username or phone). Only where it is signed
 * in is recorded: never a password, token or recovery code.
 */
export const accounts = pgTable(
  "accounts",
  {
    ...baseColumns(),
    tenantId: tenantColumn(),
    providerId: referenceColumn("provider_id").notNull(),
    identifier: text("identifier").notNull(),
    /** What the owner calls it, e.g. "Work" or "Personal". */
    label: text("label"),
    twoFactor: text("two_factor").$type<TwoFactorState>().notNull().default("unknown"),
    notes: text("notes"),
    createdBy: referenceColumn("created_by"),
  },
  (table) => [
    uniqueIndex("accounts_provider_identifier_unique").on(table.providerId, sql`lower(${table.identifier})`).where(sql`${table.deletedAt} is null`),
    index("accounts_tenant_identifier_index").on(table.tenantId, sql`lower(${table.identifier})`),
  ],
);

export type ProviderRecord = typeof providers.$inferSelect;
export type NewProviderRecord = typeof providers.$inferInsert;
export type AccountRecord = typeof accounts.$inferSelect;
export type NewAccountRecord = typeof accounts.$inferInsert;
