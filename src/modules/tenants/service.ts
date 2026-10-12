import { randomToken } from "../../shared/crypto/tokens";
import { asPlatform, inTenant } from "../../shared/db";
import { conflict, notFound, validationError } from "../../shared/http/errors";
import type { Pagination } from "../../shared/http/request";
import { isLocale } from "../../shared/i18n/locales";
import { slugify } from "../../shared/text";
import { seedBuiltInProviders } from "../accounts/service";
import { recordAudit } from "../audit/service";
import { revokeSessionsOfTenant } from "../users/repository";
import { createStaff, findStaffByEmailAnywhere, type PublicUser } from "../users/service";
import {
  countTenantsByStatus,
  findTenantById,
  findTenantBySlug,
  insertTenant,
  listActiveTenantIds,
  listTenants,
  setTenantDeletedAt,
  updateTenant as updateTenantRow,
  type TenantListQuery,
} from "./repository";
import type { TenantRecord } from "./schema";
import { SERVING_TENANT_STATUSES, TENANT_STATUSES, type TenantStatus } from "./types";
import type { PlatformTenantInput, SignupInput, TenantInput, TenantUpdateInput } from "./validation";

export { isServing } from "./status";

/** Looks a tenant up from any scope (sign-in, public pages resolve their tenant before entering its scope). */
export function tenantById(id: number): Promise<TenantRecord | undefined> {
  return asPlatform(() => findTenantById(id));
}

export function tenantBySlug(slug: string): Promise<TenantRecord | undefined> {
  return asPlatform(() => findTenantBySlug(slug));
}

/** Ids of every tenant, for jobs that visit each tenant in its own scope (cron). */
export function allTenantIds(): Promise<number[]> {
  return asPlatform(() => listActiveTenantIds());
}

async function assertSlugFree(slug: string): Promise<void> {
  if (await tenantBySlug(slug)) throw validationError("slug", "validation.slugTaken");
}

/** Creates a tenant (platform scope: tenants are created by sign-up or the platform console). */
export async function createTenant(input: TenantInput & { status?: TenantStatus }, actorId: number | null): Promise<TenantRecord> {
  await assertSlugFree(input.slug);
  return asPlatform(async () => {
    const tenant = await insertTenant({
      slug: input.slug,
      name: input.name,
      legalName: input.legalName ?? null,
      contactEmail: input.contactEmail,
      status: input.status ?? "active",
      locale: input.locale ?? null,
      createdBy: actorId,
    });
    await recordAudit({ actorType: actorId ? "staff" : "system", actorId, action: "tenant.created", subjectType: "tenant", subjectId: tenant.id, meta: { slug: tenant.slug } });
    return tenant;
  }).then(async (tenant) => {
    // Every workspace starts with the common providers (Google, Microsoft, GitHub, …).
    await inTenant(tenant.id, () => seedBuiltInProviders());
    return tenant;
  });
}

// ----- platform console -----

export type TenantListItem = TenantRecord & { deviceCount: number; accountCount: number; staffCount: number };

export function listTenantsForPlatform(query: Omit<TenantListQuery, "page" | "perPage"> & Pagination) {
  return asPlatform(() => listTenants(query));
}

export async function getTenant(id: number): Promise<TenantRecord> {
  const tenant = await tenantById(id);
  if (!tenant) throw notFound();
  return tenant;
}

/** Tenants per status, for the platform overview. */
export async function tenantStatusCounts(): Promise<Record<TenantStatus, number>> {
  const rows = await asPlatform(() => countTenantsByStatus());
  const counts = Object.fromEntries(TENANT_STATUSES.map((status) => [status, 0])) as Record<TenantStatus, number>;
  for (const row of rows) counts[row.status] = row.total;
  return counts;
}

/**
 * Platform console: creates a tenant and, when an admin email is given, its first admin with a temporary
 * password that is returned once.
 */
export async function createTenantFromPlatform(
  input: PlatformTenantInput,
  actorId: number,
): Promise<{ tenant: TenantRecord; admin: PublicUser | null; temporaryPassword: string | null }> {
  if (input.adminEmail && (await findStaffByEmailAnywhere(input.adminEmail))) throw validationError("adminEmail", "validation.emailTaken");
  const tenant = await createTenant({ ...input, status: input.status ?? "active" }, actorId);
  if (!input.adminEmail) return { tenant, admin: null, temporaryPassword: null };
  const temporaryPassword = randomToken(15);
  const admin = await inTenant(tenant.id, () =>
    createStaff(
      { name: input.adminName ?? input.adminEmail!.split("@")[0], email: input.adminEmail!, role: "admin", password: temporaryPassword, locale: isLocale(input.locale) ? input.locale : null },
      actorId,
    ),
  );
  return { tenant, admin, temporaryPassword };
}

export async function updateTenant(id: number, input: TenantUpdateInput, actorId: number): Promise<TenantRecord> {
  const current = await getTenant(id);
  const changes: Partial<TenantRecord> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.legalName !== undefined) changes.legalName = input.legalName ?? null;
  if (input.contactEmail !== undefined) changes.contactEmail = input.contactEmail;
  if (input.status !== undefined) changes.status = input.status;
  if (input.locale !== undefined) changes.locale = input.locale ?? null;
  const updated = await asPlatform(() => updateTenantRow(id, changes));
  if (!updated) throw notFound();
  // Suspending or cancelling signs every staff member of the tenant out.
  if (changes.status && !SERVING_TENANT_STATUSES.includes(changes.status) && SERVING_TENANT_STATUSES.includes(current.status)) {
    await asPlatform(() => revokeSessionsOfTenant(id));
  }
  await asPlatform(() =>
    recordAudit({ actorType: "staff", actorId, action: "tenant.updated", subjectType: "tenant", subjectId: id, meta: { fields: Object.keys(changes), status: changes.status } }),
  );
  return updated;
}

export async function deleteTenant(id: number, actorId: number): Promise<TenantRecord> {
  await getTenant(id);
  const deleted = await asPlatform(async () => {
    const row = await setTenantDeletedAt(id, new Date());
    await revokeSessionsOfTenant(id);
    await recordAudit({ actorType: "staff", actorId, action: "tenant.deleted", subjectType: "tenant", subjectId: id });
    return row;
  });
  if (!deleted) throw notFound();
  return deleted;
}

export async function restoreTenant(id: number, actorId: number): Promise<TenantRecord> {
  return asPlatform(async () => {
    const tenant = await findTenantById(id, { withTrashed: true });
    if (!tenant?.deletedAt) throw notFound();
    if (await findTenantBySlug(tenant.slug)) throw conflict("errors.slugTaken");
    const restored = await setTenantDeletedAt(id, null);
    if (!restored) throw notFound();
    await recordAudit({ actorType: "staff", actorId, action: "tenant.restored", subjectType: "tenant", subjectId: id });
    return restored;
  });
}

// ----- self-service sign-up -----

/**
 * Creates a workspace (trial) and its first admin. Both the slug and the email are checked first,
 * so a failed sign-up does not leave an empty tenant behind.
 */
/** A free workspace address from a name: "Galih's laptops" → "galih-s-laptops", then "-2", "-3", … */
async function freeSlug(name: string): Promise<string> {
  const slug = slugify(name, 36);
  const base = slug ? slug.padEnd(3, "0") : "workspace";
  for (let suffix = 1; suffix <= 20; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    if (!(await tenantBySlug(candidate))) return candidate;
  }
  return `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "0")}`;
}

export async function signUpTenant(input: Pick<SignupInput, "workspace" | "name" | "email" | "password">): Promise<{ tenant: TenantRecord; admin: PublicUser }> {
  if (await findStaffByEmailAnywhere(input.email)) throw validationError("email", "validation.emailTaken");
  const tenant = await createTenant({ slug: await freeSlug(input.workspace), name: input.workspace, contactEmail: input.email, status: "trial" }, null);
  try {
    const admin = await inTenant(tenant.id, () => createStaff({ name: input.name, email: input.email, role: "admin", password: input.password, locale: null }, null));
    return { tenant, admin };
  } catch (error) {
    await asPlatform(() => setTenantDeletedAt(tenant.id, new Date()));
    throw error;
  }
}
