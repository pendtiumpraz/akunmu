import { randomToken, sha256Hex } from "../../shared/crypto/tokens";
import { asPlatform } from "../../shared/db";
import { isDesktop } from "../../shared/env";
import { notFound, unauthorized, validationError } from "../../shared/http/errors";
import { newProviderColor, providerNameFromDomain } from "../accounts/colors";
import { listProviders } from "../accounts/repository";
import type { ProviderRecord } from "../accounts/schema";
import { createProvider, findOrCreateAccount } from "../accounts/service";
import { providerInputSchema } from "../accounts/validation";
import { recordAudit } from "../audit/service";
import {
  findDeviceByHostname,
  findDeviceById,
  findProfileById,
  listDevices,
  listProfiles,
  updateDevice as updateDeviceRow,
  updateProfile as updateProfileRow,
} from "../devices/repository";
import type { BrowserProfileRecord, DeviceRecord } from "../devices/schema";
import { createDevice, createProfile } from "../devices/service";
import { isCliTool, type DeviceSystem, type ProfileClient } from "../devices/types";
import { deviceInputSchema, profileInputSchema } from "../devices/validation";
import { signInRows, updateSignIn as updateSignInRow } from "../signins/repository";
import { recordSignIn } from "../signins/service";
import { signInInputSchema } from "../signins/validation";
import { isServing, tenantById } from "../tenants/service";
import { findLocalProfile, localProfiles, openLocalProfile, thisComputer, type ProfileTarget } from "./local-browsers";
import { localCliProfiles } from "./local-cli";
import {
  countFindings,
  findFindingById,
  findIngestTokenByHash,
  findIngestTokenById,
  insertIngestToken,
  listFindings,
  listIngestTokens,
  updateFinding,
  updateIngestToken,
  upsertFinding,
} from "./repository";
import type { FindingRecord, IngestTokenRecord } from "./schema";
import { CLAUDE_DOMAIN, type FindingKind, type FindingPayload } from "./types";
import type { AcceptFindingInput, IngestReport, IngestTokenInput } from "./validation";

/**
 * Connecting agents to a workspace: keys for the browser extension (one per device), what it reports, the desktop
 * app's scan of its own computer, and the findings both leave for the owner to accept or dismiss. Sign-ins an agent
 * sees again are confirmed without asking ("still signed in"); nothing is ever signed out by an agent.
 */

const TOKEN_PREFIX = "akm_";
/** A sign-in confirmed less than this long ago is not confirmed again on every report. */
const CONFIRM_EVERY_MS = 60 * 60 * 1000;

const lower = (value: string) => value.trim().toLowerCase();

// ----- keys -----

export function ingestTokenView(token: IngestTokenRecord, deviceName: string | null) {
  return {
    id: token.id,
    name: token.name,
    hint: token.hint,
    deviceId: token.deviceId,
    deviceName,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    lastReport: token.lastReport ?? null,
    createdAt: token.createdAt.toISOString(),
  };
}

export async function listIngestTokensView() {
  return (await listIngestTokens()).map(({ token, deviceName }) => ingestTokenView(token, deviceName));
}

/** Makes a key for one device. The key is returned this once; only its hash is kept. */
export async function createIngestToken(input: IngestTokenInput, actorId: number) {
  const device = await findDeviceById(input.deviceId);
  if (!device) throw validationError("deviceId", "validation.choice");
  const token = `${TOKEN_PREFIX}${randomToken(24)}`;
  const record = await insertIngestToken({ deviceId: device.id, name: input.name, tokenHash: sha256Hex(token), hint: token.slice(-4), createdBy: actorId });
  await recordAudit({ actorType: "staff", actorId, action: "ingest_token.created", subjectType: "ingest_token", subjectId: record.id, meta: { deviceId: device.id } });
  return { token, ...ingestTokenView(record, device.name) };
}

export async function revokeIngestToken(id: number, actorId: number) {
  const token = await findIngestTokenById(id);
  if (!token || token.revokedAt) throw notFound();
  await updateIngestToken(id, { revokedAt: new Date() });
  await recordAudit({ actorType: "staff", actorId, action: "ingest_token.revoked", subjectType: "ingest_token", subjectId: id });
}

/** The live key behind an agent's request ("Authorization: Bearer akm_…"), or 401. */
export async function authenticateIngest(authorization: string | null): Promise<IngestTokenRecord> {
  const token = /^Bearer\s+(akm_[A-Za-z0-9_-]{16,})$/i.exec(authorization?.trim() ?? "")?.[1];
  if (!token) throw unauthorized();
  const record = await asPlatform(() => findIngestTokenByHash(sha256Hex(token)));
  if (!record || !isServing(await tenantById(record.tenantId))) throw unauthorized();
  return record;
}

/**
 * What the extension shows once connected, and the sites it looks at (every provider with a domain). AkunMu Desktop
 * also tells it the computer's name, which the extension then reports everywhere (so the web app can open profiles).
 */
export async function ingestHello(token: IngestTokenRecord) {
  const [device, tenant, providers] = await Promise.all([findDeviceById(token.deviceId), tenantById(token.tenantId), listProviders()]);
  return {
    workspace: tenant?.name ?? "",
    device: device ? { id: device.id, name: device.name } : null,
    key: token.name,
    computer: isDesktop() ? thisComputer().hostname : null,
    sites: providers.filter(({ provider }) => provider.domain).map(({ provider }) => ({ domain: provider.domain as string, name: provider.name, slug: provider.slug })),
  };
}

// ----- reports and scans -----

export type ReportSummary = { confirmed: number; findings: number; review: number };

/** Where something was seen: a recorded device, or (a desktop scan of an unrecorded computer) its host name. */
type Where = { device: DeviceRecord | null; hostname: string | null; system: DeviceSystem | null; tokenId: number | null };
/** A profile as seen: a browser profile (extension report or desktop scan) or a command-line profile (desktop scan). */
type Observed = Pick<IngestReport, "profile" | "sessions" | "checked"> & { browser: ProfileClient };

function providerForDomain(providers: ProviderRecord[], domain: string): ProviderRecord | undefined {
  const host = lower(domain);
  return providers.find((provider) => provider.domain && (host === provider.domain || host.endsWith(`.${provider.domain}`)));
}

function matchProfile(profiles: BrowserProfileRecord[], observed: { name: string; directory?: string | null }, browser: ProfileClient) {
  const candidates = profiles.filter((profile) => profile.browser === browser);
  return candidates.find((profile) => observed.directory && profile.directory === observed.directory) ?? candidates.find((profile) => lower(profile.name) === lower(observed.name));
}

async function confirmSeen(signIn: { id: number; lastVerifiedAt: string; review: boolean }, tokenId: number | null) {
  if (!signIn.review && Date.now() - new Date(signIn.lastVerifiedAt).getTime() < CONFIRM_EVERY_MS) return;
  await updateSignInRow(signIn.id, { lastVerifiedAt: new Date(), review: false });
  await recordAudit({ actorType: "system", actorId: null, action: "signin.confirmed", subjectType: "sign_in", subjectId: signIn.id, meta: { tokenId } });
}

/**
 * One browser profile as an agent saw it: a profile or sign-in the map lacks becomes a finding; a recorded sign-in
 * seen again is confirmed; a recorded one on a site that was looked at but not seen is marked for a check.
 */
async function reconcile(where: Where, observed: Observed): Promise<ReportSummary> {
  const summary: ReportSummary = { confirmed: 0, findings: 0, review: 0 };
  const place = where.device ? `d${where.device.id}` : `h${where.hostname}`;
  const base = { deviceId: where.device?.id ?? null, tokenId: where.tokenId };
  const seenProfile = { name: observed.profile.name, directory: observed.profile.directory ?? null, email: observed.profile.email ?? null };
  const payload: FindingPayload = { hostname: where.hostname, system: where.system, browser: observed.browser, profile: seenProfile };
  const profileKey = `${place}:${observed.browser}:${lower(observed.profile.name)}`;

  const profile = where.device ? matchProfile(await listProfiles({ deviceId: where.device.id }), seenProfile, observed.browser) : undefined;
  if (profile && seenProfile.directory && profile.directory !== seenProfile.directory) await updateProfileRow(profile.id, { directory: seenProfile.directory });
  if (!profile) {
    await upsertFinding({ ...base, kind: "profile", fingerprint: `profile:${profileKey}`, payload });
    summary.findings += 1;
  }

  // The profile's own Google account is a sign-in to Google there.
  const sessions = [...observed.sessions];
  const profileEmail = seenProfile.email;
  if (profileEmail && !sessions.some((session) => session.identifier && lower(session.identifier) === lower(profileEmail))) sessions.push({ domain: "google.com", identifier: profileEmail });

  const providers = (await listProviders()).map(({ provider }) => provider);
  const rows = profile && where.device ? await signInRows({ deviceId: where.device.id, profileId: profile.id }) : [];
  // Per provider: the accounts seen there, or null when it was seen without one.
  const seen = new Map<number, Set<string> | null>();
  for (const session of sessions) {
    const provider = providerForDomain(providers, session.domain);
    const identifier = session.identifier?.trim() || null;
    if (provider) {
      const known = seen.get(provider.id);
      if (identifier === null) seen.set(provider.id, null);
      else if (known !== null) seen.set(provider.id, new Set([...(known ?? []), lower(identifier)]));
      const here = rows.filter((row) => row.provider.id === provider.id && (identifier === null || lower(row.account.identifier) === lower(identifier)));
      if (here.length > 0) {
        for (const row of here) await confirmSeen(row, where.tokenId);
        summary.confirmed += here.length;
        continue;
      }
    }
    const domain = provider?.domain ?? lower(session.domain);
    await upsertFinding({
      ...base,
      kind: "sign_in",
      fingerprint: `sign_in:${profileKey}:${domain}:${identifier ? lower(identifier) : "?"}`,
      payload: { ...payload, provider: { domain, name: provider?.name ?? null }, identifier },
    });
    summary.findings += 1;
  }

  const looked = new Set(observed.checked.map((domain) => providerForDomain(providers, domain)?.id).filter((id): id is number => id !== undefined));
  for (const row of rows) {
    if (row.review || !looked.has(row.provider.id)) continue;
    const identifiers = seen.get(row.provider.id);
    if (identifiers === null || identifiers?.has(lower(row.account.identifier))) continue;
    await updateSignInRow(row.id, { review: true });
    summary.review += 1;
  }
  return summary;
}

/** A computer name belongs to one device: given to this one, it is taken from any other. */
async function assignHostname(device: DeviceRecord, hostname: string): Promise<DeviceRecord> {
  if (device.hostname === hostname) return device;
  for (const { device: other } of await listDevices()) {
    if (other.id !== device.id && other.hostname === hostname) await updateDeviceRow(other.id, { hostname: null });
  }
  return (await updateDeviceRow(device.id, { hostname })) as DeviceRecord;
}

/**
 * In the desktop app, a reported profile is this computer's own: it takes the folder and the name the browser shows,
 * so the extension's reports and the app's scans describe one profile.
 */
function withLocalProfile(report: IngestReport): IngestReport {
  if (!isDesktop()) return report;
  const local = findLocalProfile({ browser: report.browser, name: report.profile.name, email: report.profile.email });
  return local ? { ...report, profile: { ...report.profile, name: local.name, directory: local.directory } } : report;
}

/** A report from the extension, for the device its key belongs to. Runs in the key's workspace. */
export async function applyReport(token: IngestTokenRecord, received: IngestReport): Promise<ReportSummary> {
  const found = await findDeviceById(token.deviceId);
  if (!found) throw notFound();
  const report = withLocalProfile(received);
  const device = report.hostname ? await assignHostname(found, report.hostname) : found;
  const summary = await reconcile({ device, hostname: device.hostname, system: device.system, tokenId: token.id }, report);
  await updateIngestToken(token.id, {
    lastUsedAt: new Date(),
    lastReport: { agent: report.agent.kind, version: report.agent.version, browser: report.browser, profile: report.profile.name },
  });
  return summary;
}

/**
 * The desktop app looks at its own computer: the browser profiles with their Google accounts, and the Claude Code
 * profiles with the Claude account signed in to each (one not signed in any more puts its recorded sign-in up for a check).
 */
export async function scanThisComputer(): Promise<ReportSummary & { profiles: number }> {
  const { hostname, system } = thisComputer();
  const device = (await findDeviceByHostname(hostname)) ?? null;
  const summary: ReportSummary = { confirmed: 0, findings: 0, review: 0 };
  if (!device) {
    await upsertFinding({ kind: "device", fingerprint: `device:${hostname}`, payload: { hostname, system }, deviceId: null, tokenId: null });
    summary.findings += 1;
  }
  const where: Where = { device, hostname, system, tokenId: null };
  const profiles = localProfiles();
  const cliProfiles = localCliProfiles();
  const observed: Observed[] = [
    ...profiles.map((local) => ({ browser: local.browser, profile: { name: local.name, directory: local.directory, email: local.email }, sessions: [], checked: [] })),
    ...cliProfiles.map((local) => ({
      browser: local.client,
      profile: { name: local.name, directory: local.directory },
      sessions: local.email ? [{ domain: CLAUDE_DOMAIN, identifier: local.email }] : [],
      checked: [CLAUDE_DOMAIN],
    })),
  ];
  for (const profile of observed) {
    const result = await reconcile(where, profile);
    summary.confirmed += result.confirmed;
    summary.findings += result.findings;
    summary.review += result.review;
  }
  return { ...summary, profiles: observed.length };
}

/** This computer in the desktop app: its host name, the device recorded for it, its browser and Claude Code profiles. */
export async function thisComputerView() {
  const computer = thisComputer();
  const device = (await findDeviceByHostname(computer.hostname)) ?? null;
  const recorded = device ? await listProfiles({ deviceId: device.id }) : [];
  return {
    ...computer,
    device: device ? { id: device.id, name: device.name } : null,
    profiles: localProfiles().map((profile) => ({ ...profile, recorded: matchProfile(recorded, profile, profile.browser) !== undefined })),
    cliProfiles: localCliProfiles().map((profile) => ({ ...profile, recorded: matchProfile(recorded, profile, profile.client) !== undefined })),
  };
}

/** Marks a recorded device as this computer (the desktop app), so scans and "open" know it. */
export async function linkThisComputer(deviceId: number, actorId: number) {
  const device = await findDeviceById(deviceId);
  if (!device) throw validationError("deviceId", "validation.choice");
  await assignHostname(device, thisComputer().hostname);
  await recordAudit({ actorType: "staff", actorId, action: "device.linked", subjectType: "device", subjectId: device.id });
}

/**
 * Opens a recorded profile in its browser on this computer (desktop app); false when it is not on this computer, or
 * is a command-line profile (no browser to open).
 */
export async function openRecordedProfile(profileId: number, url: string | null): Promise<boolean> {
  const profile = await findProfileById(profileId);
  if (!profile) throw notFound();
  const device = await findDeviceById(profile.deviceId);
  if (!device || device.hostname !== thisComputer().hostname || isCliTool(profile.browser)) return false;
  return openLocalProfile({ browser: profile.browser, directory: profile.directory, name: profile.name }, url);
}

/** Opens a profile asked for by an akunmu:// link (from the web app); only when it names this computer, if any. */
export function openLinkedProfile(target: ProfileTarget & { host?: string | null }, url: string | null): boolean {
  if (target.host && lower(target.host) !== thisComputer().hostname) return false;
  return openLocalProfile(target, url);
}

// ----- findings -----

export async function listFindingsView() {
  return (await listFindings("new")).map(({ finding, deviceName }) => ({
    id: finding.id,
    kind: finding.kind,
    payload: finding.payload,
    deviceId: finding.deviceId,
    deviceName,
    lastSeenAt: finding.lastSeenAt.toISOString(),
    createdAt: finding.createdAt.toISOString(),
  }));
}

export function countNewFindings(): Promise<number> {
  return countFindings("new");
}

async function deviceFor(finding: FindingRecord, actorId: number): Promise<DeviceRecord> {
  if (finding.deviceId) {
    const device = await findDeviceById(finding.deviceId);
    if (device) return device;
  }
  const hostname = finding.payload.hostname?.trim().toLowerCase();
  if (!hostname) throw notFound();
  const known = await findDeviceByHostname(hostname);
  if (known) return known;
  const created = await createDevice(deviceInputSchema.parse({ name: hostname, system: finding.payload.system ?? "other" }), actorId);
  return (await updateDeviceRow(created.id, { hostname })) as DeviceRecord;
}

async function profileFor(device: DeviceRecord, payload: FindingPayload, actorId: number): Promise<BrowserProfileRecord> {
  const observed = payload.profile ?? { name: "Default" };
  const browser = payload.browser ?? "chrome";
  const known = matchProfile(await listProfiles({ deviceId: device.id }), observed, browser);
  if (known) {
    if (observed.directory && !known.directory) await updateProfileRow(known.id, { directory: observed.directory });
    return known;
  }
  const created = await createProfile(device.id, profileInputSchema.parse({ browser, name: observed.name }), actorId);
  return (await updateProfileRow(created.id, { directory: observed.directory ?? null })) as BrowserProfileRecord;
}

async function providerFor(found: FindingPayload["provider"], actorId: number): Promise<{ id: number }> {
  if (!found) throw notFound();
  const known = providerForDomain((await listProviders()).map(({ provider }) => provider), found.domain);
  if (known) return known;
  const name = found.name?.trim() || providerNameFromDomain(found.domain);
  return createProvider(providerInputSchema.parse({ name, domain: found.domain, color: newProviderColor(name) }), actorId);
}

/** Records what a finding describes through the usual services (device, profile, account, sign-in). */
export async function acceptFinding(id: number, input: AcceptFindingInput, actorId: number) {
  const finding = await findFindingById(id);
  if (!finding || finding.status !== "new") throw notFound();
  const { payload } = finding;
  const identifier = payload.identifier?.trim() || input.identifier?.trim() || null;
  if (finding.kind === "sign_in" && !identifier) throw validationError("identifier", "validation.required");
  const device = await deviceFor(finding, actorId);
  if (finding.kind !== "device") {
    const profile = await profileFor(device, payload, actorId);
    if (finding.kind === "sign_in" && identifier) {
      const provider = await providerFor(payload.provider, actorId);
      const { account } = await findOrCreateAccount(provider.id, identifier, actorId);
      const existing = (await signInRows({ deviceId: device.id, profileId: profile.id })).find((row) => row.account.id === account.id);
      if (existing) await updateSignInRow(existing.id, { lastVerifiedAt: new Date(), review: false });
      else await recordSignIn(signInInputSchema.parse({ accountId: account.id, deviceId: device.id, profileId: profile.id }), actorId);
    }
  }
  await updateFinding(id, { status: "accepted", resolvedAt: new Date(), resolvedBy: actorId, deviceId: device.id });
  await recordAudit({ actorType: "staff", actorId, action: "finding.accepted", subjectType: "finding", subjectId: id, meta: { kind: finding.kind } });
}

export async function dismissFinding(id: number, actorId: number) {
  const finding = await findFindingById(id);
  if (!finding || finding.status !== "new") throw notFound();
  await updateFinding(id, { status: "dismissed", resolvedAt: new Date(), resolvedBy: actorId });
  await recordAudit({ actorType: "staff", actorId, action: "finding.dismissed", subjectType: "finding", subjectId: id, meta: { kind: finding.kind } });
}

const KIND_ORDER: Record<FindingKind, number> = { device: 0, profile: 1, sign_in: 2 };

/** Accepts every new finding that needs nothing more (sign-ins found without their account wait). */
export async function acceptAllFindings(actorId: number): Promise<{ accepted: number; waiting: number }> {
  const rows = (await listFindings("new")).map(({ finding }) => finding).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  let accepted = 0;
  for (const finding of rows) {
    if (finding.kind === "sign_in" && !finding.payload.identifier) continue;
    await acceptFinding(finding.id, {}, actorId);
    accepted += 1;
  }
  return { accepted, waiting: rows.length - accepted };
}
