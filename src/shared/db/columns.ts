import { sql } from "drizzle-orm";
import { bigint, timestamp } from "drizzle-orm/pg-core";

/**
 * Standard columns for every table (loop-v5 rules):
 * BIGINT identity primary key, created_at / updated_at, and deleted_at for soft delete.
 * There are no foreign keys: reference columns are plain BIGINT columns with an index.
 */
export function baseColumns() {
  return {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  };
}

/** A reference to another table's id, without a foreign key constraint. */
export function referenceColumn(name: string) {
  return bigint(name, { mode: "number" });
}

/** The tenant of the current database scope (set per transaction, see shared/db/scope.ts); null outside one. */
const CURRENT_TENANT = sql`nullif(current_setting('app.tenant_id', true), '')::bigint`;

/**
 * Owning tenant of a row. Filled from the active tenant scope on insert, and row level security
 * (migration 0001) only shows and accepts rows of that tenant.
 */
export function tenantColumn() {
  return bigint("tenant_id", { mode: "number" }).notNull().default(CURRENT_TENANT);
}

/** Like tenantColumn, but null marks a platform-wide row (platform staff, platform sites and settings). */
export function optionalTenantColumn() {
  return bigint("tenant_id", { mode: "number" }).default(CURRENT_TENANT);
}
