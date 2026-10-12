import { getDb } from "../../shared/db";
import { notFound, validationError } from "../../shared/http/errors";
import { findAccountById } from "../accounts/repository";
import { recordAudit } from "../audit/service";
import { restoreSignInsWhere, signInRows, softDeleteSignInsWhere, verifySignInsOfDevice } from "../signins/repository";
import { staleBefore } from "../signins/types";
import {
  findDeviceByHostname,
  findDeviceById,
  findProfileById,
  insertDevice,
  insertProfile,
  listDevices,
  listProfiles,
  restoreProfilesOfDevice,
  softDeleteProfilesOfDevice,
  updateDevice as updateDeviceRow,
  updateProfile as updateProfileRow,
} from "./repository";
import type { BrowserProfileRecord, DeviceRecord } from "./schema";
import { isCliTool } from "./types";
import type { DeviceInput, DeviceUpdateInput, ProfileInput, ProfileUpdateInput } from "./validation";

export async function getDevice(id: number): Promise<DeviceRecord> {
  const device = await findDeviceById(id);
  if (!device) throw notFound();
  return device;
}

export async function getProfile(id: number): Promise<BrowserProfileRecord> {
  const profile = await findProfileById(id);
  if (!profile) throw notFound();
  return profile;
}

export function deviceView(device: DeviceRecord) {
  return {
    id: device.id,
    name: device.name,
    kind: device.kind,
    system: device.system,
    location: device.location,
    notes: device.notes,
    lastCheckedAt: device.lastCheckedAt?.toISOString() ?? null,
    hostname: device.hostname,
    deletedAt: device.deletedAt?.toISOString() ?? null,
  };
}

export function profileView(profile: BrowserProfileRecord) {
  return {
    id: profile.id,
    deviceId: profile.deviceId,
    browser: profile.browser,
    name: profile.name,
    syncAccountId: profile.syncAccountId,
    color: profile.color,
    notes: profile.notes,
    directory: profile.directory,
  };
}

export async function listDevicesView(options: { trashed?: boolean } = {}) {
  const rows = await listDevices(options);
  return rows.map(({ device, profileCount, signInCount, accountCount, reviewCount }) => ({ ...deviceView(device), profileCount, signInCount, accountCount, reviewCount }));
}

/** A device with its browser and command-line profiles, each with the accounts signed in there, and sign-ins on the device itself. */
export async function deviceDetail(id: number) {
  const device = await getDevice(id);
  const [profiles, rows] = await Promise.all([listProfiles({ deviceId: device.id }), signInRows({ deviceId: device.id, includeSignedOut: true })]);
  return {
    ...deviceView(device),
    profiles: profiles.map((profile) => ({ ...profileView(profile), signIns: rows.filter((row) => row.profile?.id === profile.id) })),
    onDevice: rows.filter((row) => row.profile === null),
    staleBefore: staleBefore().toISOString(),
  };
}

/** A computer name belongs to one device; another device's is refused. */
async function checkHostname(hostname: string | null | undefined, deviceId?: number) {
  if (!hostname) return;
  const other = await findDeviceByHostname(hostname);
  if (other && other.id !== deviceId) throw validationError("hostname", "validation.hostnameTaken");
}

export async function createDevice(input: DeviceInput, actorId: number) {
  await checkHostname(input.hostname);
  const device = await insertDevice({
    name: input.name,
    kind: input.kind,
    system: input.system,
    location: input.location ?? null,
    notes: input.notes ?? null,
    hostname: input.hostname ?? null,
    lastCheckedAt: new Date(),
    createdBy: actorId,
  });
  await recordAudit({ actorType: "staff", actorId, action: "device.created", subjectType: "device", subjectId: device.id });
  return deviceView(device);
}

export async function updateDevice(id: number, input: DeviceUpdateInput, actorId: number) {
  await getDevice(id);
  await checkHostname(input.hostname, id);
  const updated = await updateDeviceRow(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.system !== undefined ? { system: input.system } : {}),
    ...(input.location !== undefined ? { location: input.location ?? null } : {}),
    ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    ...(input.hostname !== undefined ? { hostname: input.hostname ?? null } : {}),
  });
  await recordAudit({ actorType: "staff", actorId, action: "device.updated", subjectType: "device", subjectId: id, meta: { fields: Object.keys(input) } });
  return deviceView(updated);
}

/** "I went through this device": every active sign-in on it is confirmed now. */
export async function markDeviceChecked(id: number, actorId: number) {
  await getDevice(id);
  const confirmed = await verifySignInsOfDevice(id);
  const updated = await updateDeviceRow(id, { lastCheckedAt: new Date() });
  await recordAudit({ actorType: "staff", actorId, action: "device.checked", subjectType: "device", subjectId: id, meta: { confirmed } });
  return { ...deviceView(updated), confirmed };
}

/** Moves a device to the trash with its browser profiles and sign-ins (a sold or lost laptop). */
export async function deleteDevice(id: number, actorId: number) {
  await getDevice(id);
  const deletedAt = new Date();
  await getDb().transaction(async (tx) => {
    await updateDeviceRow(id, { deletedAt }, tx);
    await softDeleteProfilesOfDevice(id, deletedAt, tx);
    await softDeleteSignInsWhere({ deviceId: id }, deletedAt, tx);
  });
  await recordAudit({ actorType: "staff", actorId, action: "device.deleted", subjectType: "device", subjectId: id });
}

/** Restores a device with the profiles and sign-ins that went to the trash with it. */
export async function restoreDevice(id: number, actorId: number) {
  const device = await findDeviceById(id, { withTrashed: true });
  if (!device?.deletedAt) throw notFound();
  const deletedAt = device.deletedAt;
  const restored = await getDb().transaction(async (tx) => {
    const row = await updateDeviceRow(id, { deletedAt: null }, tx);
    await restoreProfilesOfDevice(id, deletedAt, tx);
    await restoreSignInsWhere({ deviceId: id }, deletedAt, tx);
    return row;
  });
  await recordAudit({ actorType: "staff", actorId, action: "device.restored", subjectType: "device", subjectId: id });
  return deviceView(restored);
}

// ----- browser and command-line profiles -----

async function checkSyncAccount(accountId: number | null | undefined) {
  if (accountId && !(await findAccountById(accountId))) throw validationError("syncAccountId", "validation.choice");
}

export async function createProfile(deviceId: number, input: ProfileInput, actorId: number) {
  const device = await getDevice(deviceId);
  await checkSyncAccount(input.syncAccountId);
  const profile = await insertProfile({
    deviceId: device.id,
    browser: input.browser,
    name: input.name,
    syncAccountId: input.syncAccountId ?? null,
    color: input.color ?? null,
    notes: input.notes ?? null,
    // A browser's folder is only ever read from the browser itself (desktop scan).
    directory: isCliTool(input.browser) ? (input.directory ?? null) : null,
    createdBy: actorId,
  });
  await recordAudit({ actorType: "staff", actorId, action: "profile.created", subjectType: "browser_profile", subjectId: profile.id, meta: { deviceId: device.id } });
  return profileView(profile);
}

/** A typed folder applies to command-line profiles; turning a profile into the other kind drops the folder it had. */
function directoryChange(current: BrowserProfileRecord, input: ProfileUpdateInput): { directory?: string | null } {
  const client = input.browser ?? current.browser;
  if (isCliTool(client) !== isCliTool(current.browser)) return { directory: isCliTool(client) ? (input.directory ?? null) : null };
  return isCliTool(client) && input.directory !== undefined ? { directory: input.directory ?? null } : {};
}

export async function updateProfile(id: number, input: ProfileUpdateInput, actorId: number) {
  const current = await getProfile(id);
  await checkSyncAccount(input.syncAccountId);
  const updated = await updateProfileRow(id, {
    ...(input.browser !== undefined ? { browser: input.browser } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.syncAccountId !== undefined ? { syncAccountId: input.syncAccountId ?? null } : {}),
    ...(input.color !== undefined ? { color: input.color ?? null } : {}),
    ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    ...directoryChange(current, input),
  });
  await recordAudit({ actorType: "staff", actorId, action: "profile.updated", subjectType: "browser_profile", subjectId: id });
  return profileView(updated);
}

/** Removes a profile and the sign-ins recorded in it. */
export async function deleteProfile(id: number, actorId: number) {
  const profile = await getProfile(id);
  const deletedAt = new Date();
  await getDb().transaction(async (tx) => {
    await updateProfileRow(id, { deletedAt }, tx);
    await softDeleteSignInsWhere({ profileId: id }, deletedAt, tx);
  });
  await recordAudit({ actorType: "staff", actorId, action: "profile.deleted", subjectType: "browser_profile", subjectId: id, meta: { deviceId: profile.deviceId } });
}
