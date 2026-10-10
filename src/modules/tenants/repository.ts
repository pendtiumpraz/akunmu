import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db, likePattern, softDeleteScope, type DbExecutor } from "../../shared/db";
import { tenants, type NewTenantRecord } from "./schema";
import type { TenantStatus } from "./types";

export type TenantListQuery = { search?: string; status?: TenantStatus; trashed?: boolean; page: number; perPage: number };

export async function findTenantById(id: number, options: { withTrashed?: boolean } = {}, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(tenants)
    .where(options.withTrashed ? eq(tenants.id, id) : and(eq(tenants.id, id), isNull(tenants.deletedAt)))
    .limit(1);
  return row;
}

export async function findTenantBySlug(slug: string, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(tenants)
    .where(and(eq(tenants.slug, slug), isNull(tenants.deletedAt)))
    .limit(1);
  return row;
}

/** Tenants with their number of devices, accounts and staff (platform console). Needs the platform scope. */
export async function listTenants(query: TenantListQuery, executor?: DbExecutor) {
  const search = query.search ? likePattern(query.search) : undefined;
  const where = and(
    softDeleteScope(tenants.deletedAt, query.trashed),
    query.status ? eq(tenants.status, query.status) : undefined,
    search ? or(ilike(tenants.name, search), ilike(tenants.slug, search), ilike(tenants.contactEmail, search)) : undefined,
  );
  const [items, [{ total }]] = await Promise.all([
    db(executor)
      .select({
        tenant: tenants,
        // Explicit aliases: inside select fields Drizzle prints bare column names, which would bind to the inner table.
        deviceCount: sql<number>`(select count(*)::int from "devices" d where d."tenant_id" = "tenants"."id" and d."deleted_at" is null)`,
        accountCount: sql<number>`(select count(*)::int from "accounts" a where a."tenant_id" = "tenants"."id" and a."deleted_at" is null)`,
        staffCount: sql<number>`(select count(*)::int from "users" u where u."tenant_id" = "tenants"."id" and u."deleted_at" is null)`,
      })
      .from(tenants)
      .where(where)
      .orderBy(desc(tenants.createdAt))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db(executor).select({ total: count() }).from(tenants).where(where),
  ]);
  return { items: items.map((row) => ({ ...row.tenant, deviceCount: row.deviceCount, accountCount: row.accountCount, staffCount: row.staffCount })), total };
}

export async function countTenantsByStatus(executor?: DbExecutor) {
  return db(executor).select({ status: tenants.status, total: count() }).from(tenants).where(isNull(tenants.deletedAt)).groupBy(tenants.status);
}

export async function insertTenant(values: NewTenantRecord, executor?: DbExecutor) {
  const [row] = await db(executor).insert(tenants).values(values).returning();
  return row;
}

export async function updateTenant(id: number, values: Partial<NewTenantRecord>, executor?: DbExecutor) {
  const [row] = await db(executor)
    .update(tenants)
    .set(values)
    .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
    .returning();
  return row;
}

export async function setTenantDeletedAt(id: number, deletedAt: Date | null, executor?: DbExecutor) {
  const [row] = await db(executor).update(tenants).set({ deletedAt }).where(eq(tenants.id, id)).returning();
  return row;
}

export async function listActiveTenantIds(executor?: DbExecutor): Promise<number[]> {
  const rows = await db(executor).select({ id: tenants.id }).from(tenants).where(isNull(tenants.deletedAt));
  return rows.map((row) => row.id);
}
