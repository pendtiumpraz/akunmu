import { eq, isNotNull, isNull, type AnyColumn } from "drizzle-orm";
import { getDb, type Database } from "./client";
import { currentTenantId } from "./scope";

export { closeDb, createDatabase, getDb, getOwnerDb, setActiveDatabase, type Database } from "./client";
export { asPlatform, currentTenantId, inTenant, isPlatformScope, requireTenantId, type DataScope } from "./scope";

/** A database handle or an open transaction; repositories accept either. */
export type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export function db(executor?: DbExecutor): DbExecutor {
  return executor ?? getDb();
}

/**
 * WHERE clause for rows owned by the current scope: the tenant's rows, or in the platform scope the
 * platform's own rows (tenant_id null). Lists use it so the platform console never mixes in tenants' rows.
 */
export function ownedByScope(tenantColumn: AnyColumn) {
  const tenantId = currentTenantId();
  return tenantId === null ? isNull(tenantColumn) : eq(tenantColumn, tenantId);
}

/** WHERE clause for the default (non-deleted) or trash view. */
export function softDeleteScope(deletedAt: AnyColumn, trashed = false) {
  return trashed ? isNotNull(deletedAt) : isNull(deletedAt);
}

/** Escapes LIKE wildcards in user search input. */
export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

/** True when a database error is a unique-constraint violation (PostgreSQL 23505). */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current === "object" && current !== null && "code" in current && (current as { code: unknown }).code === "23505") {
      return true;
    }
    current = typeof current === "object" && current !== null && "cause" in current ? (current as { cause: unknown }).cause : undefined;
  }
  return false;
}
