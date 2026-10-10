import { isUniqueViolation } from "../../shared/db";
import { conflict, notFound, validationError } from "../../shared/http/errors";
import { countAccounts, findAccountById, findProviderById } from "../accounts/repository";
import { findOrCreateAccount, providerView } from "../accounts/service";
import { recordAudit } from "../audit/service";
import { countDevices, devicesCheckedBefore, findDeviceById, findProfileById, listProfiles } from "../devices/repository";
import { deviceView, listDevicesView, profileView } from "../devices/service";
import {
  findSignInById,
  insertSignIn,
  mostSignedInAccounts,
  signInCounts,
  signInRows,
  staleSignInIds,
  updateSignIn as updateSignInRow,
  type SignInFilter,
  type SignInRow,
} from "./repository";
import type { SignInRecord } from "./schema";
import { STALE_AFTER_DAYS, staleBefore } from "./types";
import type { SignInInput, SignInUpdateInput } from "./validation";

async function getSignIn(id: number): Promise<SignInRecord> {
  const signIn = await findSignInById(id);
  if (!signIn) throw notFound();
  return signIn;
}

/** One sign-in with its account, provider, device and profile (signed out ones included). */
export async function signInRow(id: number): Promise<SignInRow> {
  const [row] = await signInRows({ ids: [id], includeSignedOut: true });
  if (!row) throw notFound();
  return row;
}

export function listSignIns(filter: SignInFilter) {
  return signInRows(filter);
}

/** Checks that the place exists: a device, and a browser profile of that device or an app on it. */
async function checkPlace(deviceId: number, profileId: number | null, app: string | null) {
  if (!(await findDeviceById(deviceId))) throw validationError("deviceId", "validation.choice");
  if (profileId !== null) {
    const profile = await findProfileById(profileId);
    if (!profile || profile.deviceId !== deviceId) throw validationError("profileId", "validation.profileOfDevice");
    if (app) throw validationError("app", "validation.appWithProfile");
  }
}

async function resolveAccount(input: SignInInput, actorId: number) {
  if (input.accountId) {
    const account = await findAccountById(input.accountId);
    if (!account) throw validationError("accountId", "validation.choice");
    return { account, created: false };
  }
  // The schema guarantees provider and identifier when no account id is given.
  const providerId = input.providerId ?? 0;
  if (!(await findProviderById(providerId))) throw validationError("providerId", "validation.choice");
  return findOrCreateAccount(providerId, input.identifier ?? "", actorId);
}

/** Records an account as signed in at a place; one active sign-in per account and place. */
export async function recordSignIn(input: SignInInput, actorId: number): Promise<SignInRow & { accountCreated: boolean }> {
  const profileId = input.profileId ?? null;
  const app = input.app ?? null;
  await checkPlace(input.deviceId, profileId, app);
  const { account, created } = await resolveAccount(input, actorId);
  let signIn: SignInRecord;
  try {
    signIn = await insertSignIn({
      accountId: account.id,
      deviceId: input.deviceId,
      profileId,
      app,
      since: input.since ?? null,
      review: input.review,
      notes: input.notes ?? null,
      createdBy: actorId,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("errors.alreadySignedIn");
    throw error;
  }
  await recordAudit({
    actorType: "staff",
    actorId,
    action: "signin.created",
    subjectType: "sign_in",
    subjectId: signIn.id,
    meta: { accountId: account.id, deviceId: input.deviceId, profileId },
  });
  return { ...(await signInRow(signIn.id)), accountCreated: created };
}

export async function updateSignIn(id: number, input: SignInUpdateInput, actorId: number) {
  const signIn = await getSignIn(id);
  const profileId = input.profileId !== undefined ? input.profileId : signIn.profileId;
  const app = input.app !== undefined ? (input.app ?? null) : signIn.app;
  if (input.profileId !== undefined || input.app !== undefined) await checkPlace(signIn.deviceId, profileId, app);
  try {
    await updateSignInRow(id, {
      ...(input.profileId !== undefined ? { profileId } : {}),
      ...(input.app !== undefined ? { app } : {}),
      ...(input.since !== undefined ? { since: input.since ?? null } : {}),
      ...(input.review !== undefined ? { review: input.review } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("errors.alreadySignedIn");
    throw error;
  }
  await recordAudit({ actorType: "staff", actorId, action: "signin.updated", subjectType: "sign_in", subjectId: id, meta: { fields: Object.keys(input) } });
  return signInRow(id);
}

/** The account was signed out there; the row stays as history. */
export async function signOut(id: number, actorId: number) {
  const signIn = await getSignIn(id);
  if (signIn.status === "signed_out") return signInRow(id);
  await updateSignInRow(id, { status: "signed_out", signedOutAt: new Date(), review: false });
  await recordAudit({ actorType: "staff", actorId, action: "signin.signed_out", subjectType: "sign_in", subjectId: id });
  return signInRow(id);
}

/** Someone looked: the account is still signed in there. */
export async function confirmSignIn(id: number, actorId: number) {
  const signIn = await getSignIn(id);
  if (signIn.status !== "signed_in") throw conflict("errors.signInEnded");
  await updateSignInRow(id, { lastVerifiedAt: new Date(), review: false });
  await recordAudit({ actorType: "staff", actorId, action: "signin.confirmed", subjectType: "sign_in", subjectId: id });
  return signInRow(id);
}

/** Removes a sign-in recorded by mistake (signing out keeps history instead). */
export async function deleteSignIn(id: number, actorId: number) {
  await getSignIn(id);
  await updateSignInRow(id, { deletedAt: new Date() });
  await recordAudit({ actorType: "staff", actorId, action: "signin.deleted", subjectType: "sign_in", subjectId: id });
}

/** Everything the sign-in map needs: devices, their browser profiles and the active sign-ins. */
export async function mapView() {
  const [devices, profiles, signIns] = await Promise.all([listDevicesView(), listProfiles(), signInRows({})]);
  return { devices, profiles: profiles.map(profileView), signIns, staleBefore: staleBefore().toISOString(), staleAfterDays: STALE_AFTER_DAYS };
}

const OVERVIEW_LIST_SIZE = 6;

/** Workspace summary: totals, sign-ins to check, accounts signed in on many places, devices to go through. */
export async function overview() {
  const before = staleBefore();
  const [deviceTotals, accountTotal, counts, busiest, staleIds, unchecked] = await Promise.all([
    countDevices(),
    countAccounts(),
    signInCounts(before),
    mostSignedInAccounts(OVERVIEW_LIST_SIZE),
    staleSignInIds(before, OVERVIEW_LIST_SIZE),
    devicesCheckedBefore(before, OVERVIEW_LIST_SIZE),
  ]);
  const stale = await signInRows({ ids: staleIds });
  return {
    totals: { ...deviceTotals, accounts: accountTotal, signIns: counts.active, signedInAccounts: counts.accounts, stale: counts.stale, review: counts.review },
    staleSignIns: stale.sort((a, b) => a.lastVerifiedAt.localeCompare(b.lastVerifiedAt)),
    busiestAccounts: busiest.map(({ account, provider, places }) => ({
      id: account.id,
      identifier: account.identifier,
      label: account.label,
      provider: providerView(provider),
      places,
    })),
    devicesToCheck: unchecked.map(deviceView),
    staleAfterDays: STALE_AFTER_DAYS,
  };
}
