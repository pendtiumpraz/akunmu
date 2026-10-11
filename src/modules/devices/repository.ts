import { and, asc, count, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db, softDeleteScope, type DbExecutor } from "../../shared/db";
import { browserProfiles, devices, type NewBrowserProfileRecord, type NewDeviceRecord } from "./schema";

/** Devices with how many browser profiles and active sign-ins each has. */
export async function listDevices(options: { trashed?: boolean } = {}) {
  return db()
    .select({
      device: devices,
      profileCount: sql<number>`(select count(*)::int from "browser_profiles" p where p."device_id" = "devices"."id" and p."deleted_at" is null)`,
      signInCount: sql<number>`(select count(*)::int from "sign_ins" s where s."device_id" = "devices"."id" and s."deleted_at" is null and s."status" = 'signed_in')`,
      accountCount: sql<number>`(select count(distinct s."account_id")::int from "sign_ins" s where s."device_id" = "devices"."id" and s."deleted_at" is null and s."status" = 'signed_in')`,
      reviewCount: sql<number>`(select count(*)::int from "sign_ins" s where s."device_id" = "devices"."id" and s."deleted_at" is null and s."status" = 'signed_in' and s."review")`,
    })
    .from(devices)
    .where(softDeleteScope(devices.deletedAt, options.trashed))
    .orderBy(asc(devices.name), asc(devices.id));
}

export async function findDeviceById(id: number, options: { withTrashed?: boolean } = {}, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(devices)
    .where(options.withTrashed ? eq(devices.id, id) : and(eq(devices.id, id), isNull(devices.deletedAt)))
    .limit(1);
  return row;
}

/** The workspace's device recorded for a computer's host name (lowercase), if any. */
export async function findDeviceByHostname(hostname: string, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(devices)
    .where(and(eq(devices.hostname, hostname), isNull(devices.deletedAt)))
    .orderBy(asc(devices.id))
    .limit(1);
  return row;
}

export async function insertDevice(values: NewDeviceRecord, executor?: DbExecutor) {
  const [row] = await db(executor).insert(devices).values(values).returning();
  return row;
}

export async function updateDevice(id: number, changes: Partial<NewDeviceRecord>, executor?: DbExecutor) {
  const [row] = await db(executor).update(devices).set(changes).where(eq(devices.id, id)).returning();
  return row;
}

export async function listProfiles(filter: { deviceId?: number } = {}) {
  return db()
    .select()
    .from(browserProfiles)
    .where(and(isNull(browserProfiles.deletedAt), filter.deviceId ? eq(browserProfiles.deviceId, filter.deviceId) : undefined))
    .orderBy(asc(browserProfiles.browser), asc(browserProfiles.name), asc(browserProfiles.id));
}

export async function findProfileById(id: number, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(browserProfiles)
    .where(and(eq(browserProfiles.id, id), isNull(browserProfiles.deletedAt)))
    .limit(1);
  return row;
}

export async function insertProfile(values: NewBrowserProfileRecord, executor?: DbExecutor) {
  const [row] = await db(executor).insert(browserProfiles).values(values).returning();
  return row;
}

export async function updateProfile(id: number, changes: Partial<NewBrowserProfileRecord>, executor?: DbExecutor) {
  const [row] = await db(executor).update(browserProfiles).set(changes).where(eq(browserProfiles.id, id)).returning();
  return row;
}

export async function softDeleteProfilesOfDevice(deviceId: number, deletedAt: Date, executor?: DbExecutor) {
  await db(executor).update(browserProfiles).set({ deletedAt }).where(and(eq(browserProfiles.deviceId, deviceId), isNull(browserProfiles.deletedAt)));
}

/** Brings back the profiles trashed together with their device (same deletion time). */
export async function restoreProfilesOfDevice(deviceId: number, deletedAt: Date, executor?: DbExecutor) {
  await db(executor).update(browserProfiles).set({ deletedAt: null }).where(and(eq(browserProfiles.deviceId, deviceId), eq(browserProfiles.deletedAt, deletedAt)));
}

export async function countDevices(): Promise<{ devices: number; profiles: number }> {
  const [[deviceRow], [profileRow]] = await Promise.all([
    db().select({ total: count() }).from(devices).where(isNull(devices.deletedAt)),
    db().select({ total: count() }).from(browserProfiles).where(isNull(browserProfiles.deletedAt)),
  ]);
  return { devices: deviceRow.total, profiles: profileRow.total };
}

/** Devices nobody went through since `before` (or ever), least recently checked first. */
export async function devicesCheckedBefore(before: Date, limit: number) {
  return db()
    .select()
    .from(devices)
    .where(and(isNull(devices.deletedAt), or(isNull(devices.lastCheckedAt), lt(devices.lastCheckedAt, before))))
    .orderBy(sql`${devices.lastCheckedAt} asc nulls first`, asc(devices.name))
    .limit(limit);
}
