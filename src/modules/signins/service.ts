import { isUniqueViolation } from "../../shared/db";
import { conflict, notFound, validationError } from "../../shared/http/errors";
import { countAccounts, findAccountById, findProviderById } from "../accounts/repository";
import { findOrCreateAccount, providerView } from "../accounts/service";
import { recordAudit } from "../audit/service";
import { countDevices, devicesCheckedBefore, findDeviceById, findProfileById, listProfiles } from "../devices/repository";
import { deviceView, listDevicesView, profileView } from "../devices/service";
import { projectsBySignIn } from "../projects/service";
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
import type { NewSignInRecord, SignInRecord } from "./schema";
import { STALE_AFTER_DAYS, staleBefore, type AppKind } from "./types";
import type { SignInInput, SignInUpdateInput } from "./validation";

/** Longest chain of origins followed when looking for a loop. */
const MAX_ORIGIN_DEPTH = 64;

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

/**
 * Checks the sign-in this one was let in from: a sign-in of the same account, and following its own origins must
 * not lead back to `selfId` (the account cannot have grown from itself).
 */
async function checkOrigin(accountId: number, originId: number, selfId?: number): Promise<void> {
  const origin = await findSignInById(originId);
  if (!origin || origin.accountId !== accountId || origin.id === selfId) throw validationError("approvedFromId", "validation.originChoice");
  // A new sign-in has no descendants yet, so it cannot close a loop.
  if (selfId === undefined) return;
  let current: SignInRecord | undefined = origin;
  for (let depth = 0; current?.approvedFromId && depth < MAX_ORIGIN_DEPTH; depth += 1) {
    if (current.approvedFromId === selfId) throw validationError("approvedFromId", "validation.originLoop");
    current = await findSignInById(current.approvedFromId);
  }
}

/** An app sign-in is an app unless said otherwise; other places have no app kind. */
function appKindFor(app: string | null, kind: AppKind | null | undefined): AppKind | null {
  return app ? (kind ?? "app") : null;
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
  const approvedFromId = input.approvedFromId ?? null;
  if (approvedFromId !== null) await checkOrigin(account.id, approvedFromId);
  let signIn: SignInRecord;
  try {
    signIn = await insertSignIn({
      accountId: account.id,
      deviceId: input.deviceId,
      profileId,
      app,
      appKind: appKindFor(app, input.appKind),
      approvedFromId,
      approvalMethod: approvedFromId !== null ? (input.approvalMethod ?? null) : null,
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
    meta: { accountId: account.id, deviceId: input.deviceId, profileId, approvedFromId },
  });
  return { ...(await signInRow(signIn.id)), accountCreated: created };
}

export async function updateSignIn(id: number, input: SignInUpdateInput, actorId: number) {
  const signIn = await getSignIn(id);
  const profileId = input.profileId !== undefined ? input.profileId : signIn.profileId;
  const app = input.app !== undefined ? (input.app ?? null) : signIn.app;
  const placeChanged = input.profileId !== undefined || input.app !== undefined;
  if (placeChanged) await checkPlace(signIn.deviceId, profileId, app);
  const changes: Partial<NewSignInRecord> = {};
  if (input.profileId !== undefined) changes.profileId = profileId;
  if (input.app !== undefined) changes.app = app;
  if (placeChanged || input.appKind !== undefined) changes.appKind = appKindFor(app, input.appKind !== undefined ? input.appKind : signIn.appKind);
  const originId = input.approvedFromId !== undefined ? input.approvedFromId : signIn.approvedFromId;
  if (input.approvedFromId !== undefined) {
    if (originId !== null) await checkOrigin(signIn.accountId, originId, id);
    changes.approvedFromId = originId;
  }
  if (input.approvedFromId !== undefined || input.approvalMethod !== undefined) {
    changes.approvalMethod = originId !== null ? (input.approvalMethod !== undefined ? input.approvalMethod : signIn.approvalMethod) : null;
  }
  if (input.since !== undefined) changes.since = input.since ?? null;
  if (input.review !== undefined) changes.review = input.review;
  if (input.notes !== undefined) changes.notes = input.notes ?? null;
  try {
    await updateSignInRow(id, changes);
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

/**
 * Every sign-in for the account trees, signed out ones included: a place an account grew from may have been signed
 * out since, and the trees can show that history.
 */
export async function treeView() {
  const [rows, projects] = await Promise.all([signInRows({ includeSignedOut: true }), projectsBySignIn()]);
  // What each session works on hangs off it in the trees.
  const signIns = rows.map((row) => ({ ...row, projects: projects.get(row.id) ?? [] }));
  return { signIns, staleBefore: staleBefore().toISOString(), staleAfterDays: STALE_AFTER_DAYS };
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
