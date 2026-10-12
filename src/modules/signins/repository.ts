import { and, asc, count, desc, eq, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbExecutor } from "../../shared/db";
import { accounts, providers } from "../accounts/schema";
import { browserProfiles, devices } from "../devices/schema";
import type { DeviceKind, DeviceSystem, ProfileClient } from "../devices/types";
import { signIns, type NewSignInRecord } from "./schema";
import type { AppKind, ApprovalMethod } from "./types";

const profile = alias(browserProfiles, "profile");

/** A sign-in with what it connects: account and provider, device, and browser profile (null on the device itself). */
export type SignInRow = {
  id: number;
  status: "signed_in" | "signed_out";
  app: string | null;
  appKind: AppKind | null;
  /** The sign-in of the same account that let this one in, and how. */
  approvedFromId: number | null;
  approvalMethod: ApprovalMethod | null;
  since: string | null;
  lastVerifiedAt: string;
  signedOutAt: string | null;
  review: boolean;
  notes: string | null;
  account: { id: number; identifier: string; label: string | null };
  provider: { id: number; slug: string; name: string; color: string; domain: string | null };
  /** `hostname` and the profile's `directory` let the desktop app open the profile ("Open in profile"). */
  device: { id: number; name: string; kind: DeviceKind; system: DeviceSystem; hostname: string | null };
  /** A browser profile, or a command-line profile (`browser` is then the tool, e.g. claude-code). */
  profile: { id: number; name: string; browser: ProfileClient; color: string | null; directory: string | null } | null;
};

export type SignInFilter = { ids?: number[]; accountId?: number; deviceId?: number; profileId?: number; includeSignedOut?: boolean };

export async function signInRows(filter: SignInFilter): Promise<SignInRow[]> {
  if (filter.ids?.length === 0) return [];
  const where: SQL | undefined = and(
    isNull(signIns.deletedAt),
    filter.ids ? inArray(signIns.id, filter.ids) : undefined,
    isNull(accounts.deletedAt),
    isNull(devices.deletedAt),
    filter.includeSignedOut ? undefined : eq(signIns.status, "signed_in"),
    filter.accountId ? eq(signIns.accountId, filter.accountId) : undefined,
    filter.deviceId ? eq(signIns.deviceId, filter.deviceId) : undefined,
    filter.profileId ? eq(signIns.profileId, filter.profileId) : undefined,
  );
  const rows = await db()
    .select({ signIn: signIns, account: accounts, provider: providers, device: devices, profile })
    .from(signIns)
    .innerJoin(accounts, eq(accounts.id, signIns.accountId))
    .innerJoin(providers, eq(providers.id, accounts.providerId))
    .innerJoin(devices, eq(devices.id, signIns.deviceId))
    .leftJoin(profile, and(eq(profile.id, signIns.profileId), isNull(profile.deletedAt)))
    .where(where)
    .orderBy(asc(signIns.status), asc(devices.name), asc(profile.name), asc(providers.name), asc(sql`lower(${accounts.identifier})`));
  return rows.map(({ signIn, account, provider, device, profile: browserProfile }) => ({
    id: signIn.id,
    status: signIn.status,
    app: signIn.app,
    appKind: signIn.app ? (signIn.appKind ?? "app") : null,
    approvedFromId: signIn.approvedFromId,
    approvalMethod: signIn.approvedFromId ? signIn.approvalMethod : null,
    since: signIn.since,
    lastVerifiedAt: signIn.lastVerifiedAt.toISOString(),
    signedOutAt: signIn.signedOutAt?.toISOString() ?? null,
    review: signIn.review,
    notes: signIn.notes,
    account: { id: account.id, identifier: account.identifier, label: account.label },
    provider: { id: provider.id, slug: provider.slug, name: provider.name, color: provider.color, domain: provider.domain },
    device: { id: device.id, name: device.name, kind: device.kind, system: device.system, hostname: device.hostname },
    profile: browserProfile
      ? { id: browserProfile.id, name: browserProfile.name, browser: browserProfile.browser, color: browserProfile.color, directory: browserProfile.directory }
      : null,
  }));
}

export async function findSignInById(id: number, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(signIns)
    .where(and(eq(signIns.id, id), isNull(signIns.deletedAt)))
    .limit(1);
  return row;
}

export async function insertSignIn(values: NewSignInRecord, executor?: DbExecutor) {
  const [row] = await db(executor).insert(signIns).values(values).returning();
  return row;
}

export async function updateSignIn(id: number, changes: Partial<NewSignInRecord>, executor?: DbExecutor) {
  const [row] = await db(executor).update(signIns).set(changes).where(eq(signIns.id, id)).returning();
  return row;
}

type OwnerFilter = { accountId?: number; deviceId?: number; profileId?: number };

function ownedBy(filter: OwnerFilter) {
  return [
    filter.accountId ? eq(signIns.accountId, filter.accountId) : undefined,
    filter.deviceId ? eq(signIns.deviceId, filter.deviceId) : undefined,
    filter.profileId ? eq(signIns.profileId, filter.profileId) : undefined,
  ];
}

/** Trashes the sign-ins of a deleted account, device or browser profile, stamped with the owner's deletion time. */
export async function softDeleteSignInsWhere(filter: OwnerFilter, deletedAt: Date, executor?: DbExecutor) {
  await db(executor).update(signIns).set({ deletedAt }).where(and(isNull(signIns.deletedAt), ...ownedBy(filter)));
}

/**
 * Brings back the sign-ins trashed together with their account or device (same deletion time), except those
 * whose account, device or profile is still in the trash. Restore the owner first.
 */
export async function restoreSignInsWhere(filter: OwnerFilter, deletedAt: Date, executor?: DbExecutor) {
  await db(executor)
    .update(signIns)
    .set({ deletedAt: null })
    .where(
      and(
        eq(signIns.deletedAt, deletedAt),
        ...ownedBy(filter),
        sql`${signIns.accountId} in (select "id" from "accounts" where "deleted_at" is null)`,
        sql`${signIns.deviceId} in (select "id" from "devices" where "deleted_at" is null)`,
        sql`(${signIns.profileId} is null or ${signIns.profileId} in (select "id" from "browser_profiles" where "deleted_at" is null))`,
      ),
    );
}

/** Confirms every active sign-in of a device at once ("all still signed in"). */
export async function verifySignInsOfDevice(deviceId: number, executor?: DbExecutor): Promise<number> {
  const rows = await db(executor)
    .update(signIns)
    .set({ lastVerifiedAt: new Date(), review: false })
    .where(and(eq(signIns.deviceId, deviceId), isNull(signIns.deletedAt), eq(signIns.status, "signed_in")))
    .returning({ id: signIns.id });
  return rows.length;
}

/** Numbers for the overview: active sign-ins, those to check (stale or marked) and accounts signed in. */
export async function signInCounts(staleBefore: Date) {
  const [row] = await db()
    .select({
      active: count(),
      stale: sql<number>`count(*) filter (where ${signIns.lastVerifiedAt} < ${staleBefore.toISOString()}::timestamptz)`.mapWith(Number),
      review: sql<number>`count(*) filter (where ${signIns.review})`.mapWith(Number),
      accounts: sql<number>`count(distinct ${signIns.accountId})`.mapWith(Number),
    })
    .from(signIns)
    .innerJoin(accounts, and(eq(accounts.id, signIns.accountId), isNull(accounts.deletedAt)))
    .innerJoin(devices, and(eq(devices.id, signIns.deviceId), isNull(devices.deletedAt)))
    .where(and(isNull(signIns.deletedAt), eq(signIns.status, "signed_in")));
  return row;
}

/** Accounts signed in on the most places, most first. */
export async function mostSignedInAccounts(limit: number) {
  const places = count(signIns.id);
  return db()
    .select({ account: accounts, provider: providers, places })
    .from(signIns)
    .innerJoin(accounts, and(eq(accounts.id, signIns.accountId), isNull(accounts.deletedAt)))
    .innerJoin(providers, eq(providers.id, accounts.providerId))
    .innerJoin(devices, and(eq(devices.id, signIns.deviceId), isNull(devices.deletedAt)))
    .where(and(isNull(signIns.deletedAt), eq(signIns.status, "signed_in")))
    .groupBy(accounts.id, providers.id)
    .orderBy(desc(places), asc(sql`lower(${accounts.identifier})`))
    .limit(limit);
}

/** Active sign-ins not confirmed since `before`, oldest first. */
export async function staleSignInIds(before: Date, limit: number): Promise<number[]> {
  const rows = await db()
    .select({ id: signIns.id })
    .from(signIns)
    .innerJoin(accounts, and(eq(accounts.id, signIns.accountId), isNull(accounts.deletedAt)))
    .innerJoin(devices, and(eq(devices.id, signIns.deviceId), isNull(devices.deletedAt)))
    .where(and(isNull(signIns.deletedAt), eq(signIns.status, "signed_in"), lt(signIns.lastVerifiedAt, before)))
    .orderBy(asc(signIns.lastVerifiedAt))
    .limit(limit);
  return rows.map((row) => row.id);
}
