import { z } from "zod";
import type { AgentActionPreview, AgentPreviewField } from "@/modules/ai/agent-types";
import type { AiToolSpec } from "@/modules/ai/types";
import { findAccountByIdentifier, findAccountsByText, listProviders } from "@/modules/accounts/repository";
import type { AccountRecord, ProviderRecord } from "@/modules/accounts/schema";
import { createProvider, getAccount, getProvider, listAccountsView, providerView, updateAccount } from "@/modules/accounts/service";
import { TWO_FACTOR_STATES, type TwoFactorState } from "@/modules/accounts/types";
import { accountUpdateSchema, providerInputSchema } from "@/modules/accounts/validation";
import { createDevice, createProfile, deviceDetail, getDevice, getProfile, listDevicesView, markDeviceChecked } from "@/modules/devices/service";
import {
  DEVICE_KINDS,
  DEVICE_SYSTEMS,
  PROFILE_CLIENTS,
  SYSTEM_NAMES,
  claudeConfigFolder,
  isCliTool,
  profileClientName,
  type DeviceKind,
  type DeviceSystem,
  type ProfileClient,
} from "@/modules/devices/types";
import { deviceInputSchema, profileInputSchema } from "@/modules/devices/validation";
import type { SignInRow } from "@/modules/signins/repository";
import { confirmSignIn, listSignIns, overview, recordSignIn, signOut, updateSignIn } from "@/modules/signins/service";
import { APP_KINDS, APPROVAL_METHODS, staleBefore, type AppKind } from "@/modules/signins/types";
import { signInInputSchema } from "@/modules/signins/validation";
import { can, type Permission } from "@/modules/users/permissions";
import type { StaffRole } from "@/modules/users/schema";
import { AppError, notFound, validationError } from "@/shared/http/errors";
import { parseWith } from "@/shared/http/validation";
import type { I18n } from "@/shared/i18n/messages-loader";
import type { MessageKey, Translator } from "@/shared/i18n/translate";
import { slugify } from "@/shared/text";
import { zonedDate } from "@/shared/time";

/**
 * What the assistant can do. Every tool runs in the staff member's workspace scope (row level security keeps it
 * inside the workspace) and needs the same permission as the matching screen. "read" tools run right away;
 * "action" tools only propose a change: the person sees a confirmation card and the change runs on confirm.
 * Tool names, descriptions and results are for the model (English); previews are in the person's language.
 */

export type AgentStaff = { id: number; name: string; email: string; role: StaffRole };

export type AgentContext = { staff: AgentStaff; i18n: I18n };

type ToolBase<Schema extends z.ZodType> = { name: string; description: string; permission: Permission; input: Schema };

type ReadTool<Schema extends z.ZodType> = ToolBase<Schema> & {
  kind: "read";
  run: (input: z.output<Schema>, context: AgentContext) => Promise<unknown>;
};

type ActionTool<Schema extends z.ZodType> = ToolBase<Schema> & {
  kind: "action";
  /** Checks the proposal (throws like `run` would) and describes it for the confirmation card. */
  preview: (input: z.output<Schema>, context: AgentContext) => Promise<AgentActionPreview>;
  run: (input: z.output<Schema>, context: AgentContext, secrets: Record<string, string>) => Promise<unknown>;
};

export type AgentTool = ReadTool<z.ZodType> | ActionTool<z.ZodType>;

function readTool<Schema extends z.ZodType>(tool: Omit<ReadTool<Schema>, "kind">): AgentTool {
  return { ...tool, kind: "read" } as unknown as AgentTool;
}

function actionTool<Schema extends z.ZodType>(tool: Omit<ActionTool<Schema>, "kind">): AgentTool {
  return { ...tool, kind: "action" } as unknown as AgentTool;
}

// ----- helpers -----

/** Dates the model reads are calendar days in this time zone (workspaces have no time zone of their own yet). */
export const AGENT_TIME_ZONE = "Asia/Jakarta";
const MAX_BATCH = 20;
const DEFAULT_PROVIDER_COLOR = "#64748b";

const KIND_LABELS: Record<DeviceKind, MessageKey> = {
  laptop: "devices.kind_laptop",
  desktop: "devices.kind_desktop",
  phone: "devices.kind_phone",
  tablet: "devices.kind_tablet",
  other: "devices.kind_other",
};

const TWO_FACTOR_LABELS: Record<TwoFactorState, MessageKey> = {
  on: "accounts.twoFactor_on",
  off: "accounts.twoFactor_off",
  unknown: "accounts.twoFactor_unknown",
};

function localDay(value: string | Date): string {
  return zonedDate(value instanceof Date ? value : new Date(value), AGENT_TIME_ZONE);
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function field(label: string, value: string | null | undefined, before?: string | null): AgentPreviewField[] {
  if (value === null || value === undefined || value === "") return [];
  return [{ label, value, ...(before !== undefined && before !== null && before !== value ? { before } : {}) }];
}

/** A browser's or command-line tool's name: "Chrome", "Claude Code". */
export function browserName(browser: ProfileClient, t: Translator): string {
  return profileClientName(browser) ?? t("devices.browserOther");
}

export function systemName(system: DeviceSystem, t: Translator): string {
  return system === "other" ? t("devices.systemOther") : SYSTEM_NAMES[system];
}

/** Where a sign-in is, in the person's language: "Chrome · Work — Office laptop". */
export function placeText(row: Pick<SignInRow, "app" | "device" | "profile"> & { appKind?: AppKind | null }, t: Translator): string {
  if (row.profile) return t("signIns.placeProfile", { browser: browserName(row.profile.browser, t), profile: row.profile.name, device: row.device.name });
  if (row.app) return t(row.appKind === "cli" ? "signIns.placeCli" : "signIns.placeApp", { app: row.app, device: row.device.name });
  return t("signIns.placeDevice", { device: row.device.name });
}

function accountText(account: { identifier: string; label: string | null }, provider: { name: string }): string {
  return `${provider.name} · ${account.identifier}${account.label ? ` (${account.label})` : ""}`;
}

/** A sign-in as the model reads it: ids to act on, the place, and whether it should be checked. */
function signInForModel(row: SignInRow, stale: Date) {
  return {
    signInId: row.id,
    account: { id: row.account.id, identifier: row.account.identifier, label: row.account.label, provider: row.provider.name },
    device: { id: row.device.id, name: row.device.name },
    place: row.profile
      ? { browserProfileId: row.profile.id, browser: row.profile.browser, profile: row.profile.name }
      : row.app
        ? { app: row.app, kind: row.appKind }
        : "the device itself",
    grewFrom: row.approvedFromId ? { signInId: row.approvedFromId, how: row.approvalMethod } : null,
    status: row.status,
    since: row.since,
    lastConfirmed: localDay(row.lastVerifiedAt),
    toCheck: row.status === "signed_in" && (row.review || new Date(row.lastVerifiedAt) < stale),
    signedOutOn: row.signedOutAt ? localDay(row.signedOutAt) : null,
    notes: row.notes ? clip(row.notes, 200) : null,
  };
}

/** A provider by name, slug or domain ("Google", "github", "gitlab.com"). */
async function resolveProvider(name: string): Promise<ProviderRecord> {
  const wanted = name.trim().toLowerCase();
  const rows = await listProviders();
  const found =
    rows.find(({ provider }) => provider.slug === wanted || provider.name.toLowerCase() === wanted || provider.domain === wanted) ??
    rows.find(({ provider }) => slugify(provider.name) === slugify(wanted));
  if (!found) throw validationError("provider", "validation.providerUnknown", { provider: clip(name.trim(), 60) });
  return found.provider;
}

async function signInsByIds(ids: number[]): Promise<SignInRow[]> {
  const unique = [...new Set(ids)];
  const rows = await listSignIns({ ids: unique, includeSignedOut: true });
  if (rows.length !== unique.length) throw validationError("signInIds", "validation.signInUnknown");
  return unique.map((id) => rows.find((row) => row.id === id) as SignInRow);
}

// ----- input pieces -----

const deviceId = z.number().int().min(1).describe("Device id: from list_devices, or the number in an @[Name](device:ID) mention.");
const accountId = z.number().int().min(1).describe("Account id: from find_account or list_accounts, or the number in an @[Name](account:ID) mention.");
const signInIds = z.array(z.number().int().min(1)).min(1).max(MAX_BATCH).describe("Sign-in ids (signInId) from find_account or get_device.");
const providerName = z.string().min(1).max(60).describe("Provider name, slug or domain, e.g. Google, github or gitlab.com (see list_providers).");
const limit = (max: number) => z.number().int().min(1).max(max).optional().describe(`At most ${max}.`);

// ----- reading the map -----

const findAccountTool = readTool({
  name: "find_account",
  description:
    "Where is an account signed in? Finds accounts by email, username, phone or label (or part of it) and returns, for each, every place it is signed in (device, browser profile or app) and recent sign-outs.",
  permission: "map.read",
  input: z.object({
    query: z.string().min(1).max(200).describe("Email, username, phone number or label, or part of it."),
    provider: providerName.optional(),
    includeSignedOut: z.boolean().optional().describe("Return the full sign-out history instead of the last 3."),
  }),
  run: async (input) => {
    const provider = input.provider ? await resolveProvider(input.provider) : null;
    const matches = await findAccountsByText(input.query.trim(), { providerId: provider?.id, limit: 10 });
    const stale = staleBefore();
    const accounts = await Promise.all(
      matches.map(async ({ account, provider: owner }) => {
        const rows = await listSignIns({ accountId: account.id, includeSignedOut: true });
        const ended = rows
          .filter((row) => row.status === "signed_out")
          .sort((a, b) => (b.signedOutAt ?? "").localeCompare(a.signedOutAt ?? ""))
          .slice(0, input.includeSignedOut ? 50 : 3);
        return {
          id: account.id,
          identifier: account.identifier,
          label: account.label,
          provider: owner.name,
          twoFactor: account.twoFactor,
          signedIn: rows.filter((row) => row.status === "signed_in").map((row) => signInForModel(row, stale)),
          recentlySignedOut: ended.map((row) => signInForModel(row, stale)),
          url: `/app/accounts/${account.id}`,
        };
      }),
    );
    return { accounts, ...(matches.length === 10 ? { note: "Only the first 10 matches; narrow the search." } : {}) };
  },
});

const listDevicesTool = readTool({
  name: "list_devices",
  description:
    "Devices of this workspace (laptops, PCs, phones, tablets) with how many profiles (browser and command-line), sign-ins and accounts each has, and when each was last checked.",
  permission: "map.read",
  input: z.object({}),
  run: async (_input, context) => {
    const devices = await listDevicesView();
    return {
      devices: devices.map((device) => ({
        id: device.id,
        name: device.name,
        kind: device.kind,
        system: systemName(device.system, context.i18n.t),
        location: device.location,
        browserProfiles: device.profileCount,
        signIns: device.signInCount,
        accounts: device.accountCount,
        markedForReview: device.reviewCount,
        lastChecked: device.lastCheckedAt ? localDay(device.lastCheckedAt) : null,
      })),
    };
  },
});

const getDeviceTool = readTool({
  name: "get_device",
  description:
    "One device: its profiles with the accounts signed in to each (browser profiles, and command-line profiles: browser claude-code, one per Claude Code account the device runs), and the accounts signed in on the device itself (system and apps).",
  permission: "map.read",
  input: z.object({ deviceId, includeSignedOut: z.boolean().optional().describe("Also list sign-ins that ended.") }),
  run: async (input, context) => {
    const device = await deviceDetail(input.deviceId);
    const stale = staleBefore();
    const keep = (rows: SignInRow[]) => rows.filter((row) => input.includeSignedOut || row.status === "signed_in").map((row) => signInForModel(row, stale));
    return {
      id: device.id,
      name: device.name,
      kind: device.kind,
      system: systemName(device.system, context.i18n.t),
      location: device.location,
      notes: device.notes ? clip(device.notes, 300) : null,
      lastChecked: device.lastCheckedAt ? localDay(device.lastCheckedAt) : null,
      browserProfiles: device.profiles.map((profile) => ({
        id: profile.id,
        browser: profile.browser,
        name: profile.name,
        ...(isCliTool(profile.browser) ? { commandLine: true, folder: profile.directory } : {}),
        signIns: keep(profile.signIns),
      })),
      onTheDevice: keep(device.onDevice),
      url: `/app/devices/${device.id}`,
    };
  },
});

const listAccountsTool = readTool({
  name: "list_accounts",
  description: "Accounts of this workspace, by provider, with how many places each is signed in.",
  permission: "map.read",
  input: z.object({
    search: z.string().max(100).optional().describe("Words from the identifier, label or provider."),
    provider: providerName.optional(),
    limit: limit(50),
  }),
  run: async (input) => {
    const provider = input.provider ? await resolveProvider(input.provider) : null;
    const { items, total } = await listAccountsView({ search: input.search?.trim() || undefined, providerId: provider?.id, page: 1, perPage: input.limit ?? 30 });
    return {
      total,
      accounts: items.map((item) => ({
        id: item.id,
        identifier: item.identifier,
        label: item.label,
        provider: item.provider.name,
        twoFactor: item.twoFactor,
        signedInPlaces: item.activeSignIns,
      })),
    };
  },
});

const listProvidersTool = readTool({
  name: "list_providers",
  description: "Providers accounts can belong to (Google, Microsoft, GitHub, …), with how many accounts each has.",
  permission: "map.read",
  input: z.object({}),
  run: async () => {
    const rows = await listProviders();
    return { providers: rows.map(({ provider, accountCount }) => ({ slug: provider.slug, name: provider.name, domain: provider.domain, accounts: accountCount })) };
  },
});

const getOverviewTool = readTool({
  name: "get_overview",
  description:
    "Summary of the workspace: totals, sign-ins to check (not confirmed for a while, or marked for review), accounts signed in on the most places, and devices not gone through lately.",
  permission: "map.read",
  input: z.object({}),
  run: async () => {
    const summary = await overview();
    const stale = staleBefore();
    return {
      totals: summary.totals,
      staleAfterDays: summary.staleAfterDays,
      toCheck: summary.staleSignIns.map((row) => signInForModel(row, stale)),
      busiestAccounts: summary.busiestAccounts.map((account) => ({ id: account.id, identifier: account.identifier, provider: account.provider.name, places: account.places })),
      devicesToCheck: summary.devicesToCheck.map((device) => ({ id: device.id, name: device.name, lastChecked: device.lastCheckedAt ? localDay(device.lastCheckedAt) : null })),
    };
  },
});

// ----- devices, profiles and providers -----

const addDeviceInput = z.object({
  name: z.string().min(1).max(80).describe("What the owner calls it, e.g. Office laptop or Pixel 8."),
  kind: z.enum(DEVICE_KINDS).optional(),
  system: z.enum(DEVICE_SYSTEMS).optional(),
  location: z.string().max(80).optional().describe("Where it usually is, e.g. Office or Home."),
  notes: z.string().max(500).optional(),
});

const addDeviceAction = actionTool({
  name: "add_device",
  description: "Add a device (laptop, PC, phone, tablet) to the map.",
  permission: "map.write",
  input: addDeviceInput,
  preview: async (input, context) => {
    const parsed = parseWith(deviceInputSchema, input);
    const { t } = context.i18n;
    return {
      title: t("ai.action.addDevice"),
      fields: [
        ...field(t("devices.fieldName"), parsed.name),
        ...field(t("devices.fieldKind"), t(KIND_LABELS[parsed.kind])),
        ...field(t("devices.fieldSystem"), systemName(parsed.system, t)),
        ...field(t("devices.fieldLocation"), parsed.location),
        ...field(t("devices.fieldNotes"), parsed.notes ? clip(parsed.notes, 200) : null),
      ],
    };
  },
  run: async (input, context) => {
    const device = await createDevice(parseWith(deviceInputSchema, input), context.staff.id);
    return { id: device.id, name: device.name, kind: device.kind, system: device.system, url: `/app/devices/${device.id}` };
  },
});

const addProfileInput = z.object({
  deviceId,
  browser: z
    .enum(PROFILE_CLIENTS)
    .optional()
    .describe("Default chrome. claude-code for a command-line profile: one Claude Code account run by its own command from its own config folder."),
  name: z.string().min(1).max(60).describe("The profile's name as the browser shows it (Work, Personal), or a command-line profile's command (claude-work)."),
  directory: z.string().max(260).optional().describe("Only for a command-line profile: its config folder, e.g. ~/.claude-work."),
});

const addProfileAction = actionTool({
  name: "add_browser_profile",
  description:
    "Add a profile to a device: a browser profile (Chrome's Work, Edge's Personal, …) or a command-line profile (browser claude-code: each Claude Code account a device runs, e.g. claude-work with ~/.claude-work). Accounts are then recorded in it with record_sign_ins.",
  permission: "map.write",
  input: addProfileInput,
  preview: async (input, context) => {
    const device = await getDevice(input.deviceId);
    const parsed = parseWith(profileInputSchema, { browser: input.browser, name: input.name, directory: input.directory });
    const { t } = context.i18n;
    const cli = isCliTool(parsed.browser);
    return {
      title: t(cli ? "ai.action.addCliProfile" : "ai.action.addProfile", { device: device.name }),
      fields: [
        ...field(cli ? t("profiles.fieldTool") : t("profiles.fieldBrowser"), browserName(parsed.browser, t)),
        ...field(cli ? t("profiles.fieldCommand") : t("profiles.fieldName"), parsed.name),
        ...(cli ? field(t("profiles.fieldFolder"), parsed.directory ?? claudeConfigFolder(parsed.name)) : []),
      ],
    };
  },
  run: async (input, context) => {
    const parsed = parseWith(profileInputSchema, { browser: input.browser, name: input.name, directory: input.directory });
    const directory = isCliTool(parsed.browser) ? (parsed.directory ?? claudeConfigFolder(parsed.name)) : null;
    const profile = await createProfile(input.deviceId, { ...parsed, directory }, context.staff.id);
    return { id: profile.id, deviceId: profile.deviceId, browser: profile.browser, name: profile.name, directory: profile.directory };
  },
});

const addProviderInput = z.object({
  name: z.string().min(1).max(60).describe("e.g. Bitbucket or Bank Jago."),
  domain: z.string().max(120).optional().describe("Its web domain, e.g. bitbucket.org."),
});

function providerInput(input: z.output<typeof addProviderInput>) {
  return parseWith(providerInputSchema, { name: input.name, domain: input.domain, color: DEFAULT_PROVIDER_COLOR });
}

const addProviderAction = actionTool({
  name: "add_provider",
  description: "Add a provider that is not in list_providers yet, so its accounts can be recorded.",
  permission: "map.write",
  input: addProviderInput,
  preview: async (input, context) => {
    const parsed = providerInput(input);
    const { t } = context.i18n;
    return { title: t("ai.action.addProvider"), fields: [...field(t("providers.fieldName"), parsed.name), ...field(t("providers.fieldDomain"), parsed.domain)] };
  },
  run: async (input, context) => {
    const provider = await createProvider(providerInput(input), context.staff.id);
    return { slug: provider.slug, name: provider.name, domain: provider.domain };
  },
});

// ----- sign-ins -----

const recordSignInsInput = z.object({
  deviceId,
  browserProfileId: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Profile id from get_device: a browser profile, or a command-line profile (a Claude Code account the device runs). Leave out for sign-ins on the device itself (its system or an app)."),
  app: z.string().max(60).optional().describe("Only without a browser profile: the app or system signed in, e.g. Windows, Gmail app or WhatsApp."),
  appKind: z.enum(APP_KINDS).optional().describe("With app: 'cli' for a command-line tool (gh, claude, gcloud, vercel), otherwise 'app'."),
  accounts: z
    .array(
      z.object({
        accountId: accountId.optional().describe("An existing account's id; or give provider and identifier instead."),
        provider: providerName.optional(),
        identifier: z.string().max(200).optional().describe("Email, username or phone number the account signs in with. A new account is added when the workspace has none."),
        grewFromSignInId: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("When this place was let in from another one where the same account was already signed in (a code, magic link, QR code or prompt approved there): that sign-in's id from find_account."),
        approvalMethod: z.enum(APPROVAL_METHODS).optional().describe("How it was let in: code (device code), link (magic link), qr (QR scanned there) or prompt (approved there)."),
      }),
    )
    .min(1)
    .max(MAX_BATCH),
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Local date (YYYY-MM-DD) the accounts were signed in there, if the person said."),
  notes: z.string().max(500).optional(),
});

type RecordInput = z.output<typeof recordSignInsInput>;
type PlannedAccount = {
  account: AccountRecord | null;
  provider: ProviderRecord;
  identifier: string;
  alreadyThere: boolean;
  /** The sign-in this place was let in from, and how. */
  origin: SignInRow | null;
  approvalMethod: RecordInput["accounts"][number]["approvalMethod"] | null;
};

/** Resolves the place and each account of a record_sign_ins call; shared by the preview and the run. */
async function planSignIns(input: RecordInput) {
  const device = await getDevice(input.deviceId);
  const profile = input.browserProfileId ? await getProfile(input.browserProfileId) : null;
  if (profile && profile.deviceId !== device.id) throw validationError("browserProfileId", "validation.profileOfDevice");
  const app = profile ? null : input.app?.trim() || null;
  const appKind = app ? (input.appKind ?? "app") : null;
  if (profile && input.app?.trim()) throw validationError("app", "validation.appWithProfile");
  const active = await listSignIns({ deviceId: device.id });
  const originIds = input.accounts.flatMap((entry) => (entry.grewFromSignInId ? [entry.grewFromSignInId] : []));
  const origins = originIds.length > 0 ? await listSignIns({ ids: originIds, includeSignedOut: true }) : [];
  const samePlace = (row: SignInRow) => (row.profile?.id ?? null) === (profile?.id ?? null) && (row.app ?? "").toLowerCase() === (app ?? "").toLowerCase();
  const planned: PlannedAccount[] = [];
  for (const [index, entry] of input.accounts.entries()) {
    let account: AccountRecord | null = null;
    let provider: ProviderRecord;
    if (entry.accountId) {
      account = await getAccount(entry.accountId);
      provider = await getProvider(account.providerId);
    } else {
      if (!entry.provider || !entry.identifier?.trim()) throw validationError(`accounts.${index}`, "validation.accountRequired");
      provider = await resolveProvider(entry.provider);
      account = (await findAccountByIdentifier(provider.id, entry.identifier.trim())) ?? null;
    }
    const identifier = account?.identifier ?? entry.identifier?.trim() ?? "";
    if (planned.some((item) => item.provider.id === provider.id && item.identifier.toLowerCase() === identifier.toLowerCase())) continue;
    const alreadyThere = account !== null && active.some((row) => row.account.id === account.id && samePlace(row));
    const origin = entry.grewFromSignInId ? (origins.find((row) => row.id === entry.grewFromSignInId) ?? null) : null;
    if (entry.grewFromSignInId && (!origin || !account || origin.account.id !== account.id)) throw validationError(`accounts.${index}.grewFromSignInId`, "validation.originChoice");
    planned.push({ account, provider, identifier, alreadyThere, origin, approvalMethod: origin ? (entry.approvalMethod ?? null) : null });
  }
  return { device, profile, app, appKind, planned };
}

const recordSignInsAction = actionTool({
  name: "record_sign_ins",
  description:
    "Record accounts as signed in at one place: a browser profile or command-line profile of a device, or the device itself (with an optional app name). Accounts are given by id, or by provider and identifier (missing accounts are added).",
  permission: "map.write",
  input: recordSignInsInput,
  preview: async (input, context) => {
    const { device, profile, app, appKind, planned } = await planSignIns(input);
    const { t } = context.i18n;
    const place = placeText({ device: { ...device }, profile: profile ? { ...profile } : null, app, appKind }, t);
    const fresh = planned.filter((item) => !item.account);
    const skipped = planned.filter((item) => item.alreadyThere);
    const grewFrom = (item: PlannedAccount) =>
      item.origin
        ? ` · ${t("ai.grewFrom", { place: placeText(item.origin, t), how: item.approvalMethod ? t.dynamic(`signIns.approval_${item.approvalMethod}`) : t("signIns.approvalAny") })}`
        : "";
    return {
      title: t("ai.action.recordSignIns"),
      fields: [
        ...field(t("signIns.fieldPlace"), place),
        ...planned.map((item) => ({
          label: item.provider.name,
          value: `${item.identifier}${!item.account ? ` · ${t("ai.newAccount")}` : item.alreadyThere ? ` · ${t("ai.alreadySignedInThere")}` : ""}${grewFrom(item)}`,
        })),
        ...field(t("signIns.fieldSince"), input.since ? context.i18n.format.date(new Date(`${input.since}T00:00:00Z`), "UTC") : null),
        ...field(t("signIns.fieldNotes"), input.notes ? clip(input.notes, 200) : null),
      ],
      note: [fresh.length > 0 ? t("ai.note.newAccounts", { count: fresh.length }) : "", skipped.length > 0 ? t("ai.note.alreadySignedIn", { count: skipped.length }) : ""]
        .filter(Boolean)
        .join(" ") || undefined,
    };
  },
  run: async (input, context) => {
    const { device, profile, app, appKind, planned } = await planSignIns(input);
    const recorded: unknown[] = [];
    const skipped: string[] = [];
    for (const item of planned) {
      if (item.alreadyThere) {
        skipped.push(item.identifier);
        continue;
      }
      const parsed = parseWith(signInInputSchema, {
        accountId: item.account?.id ?? null,
        providerId: item.account ? null : item.provider.id,
        identifier: item.account ? null : item.identifier,
        deviceId: device.id,
        profileId: profile?.id ?? null,
        app,
        appKind,
        approvedFromId: item.origin?.id ?? null,
        approvalMethod: item.approvalMethod,
        since: input.since ?? null,
        notes: input.notes ?? null,
      });
      try {
        const row = await recordSignIn(parsed, context.staff.id);
        recorded.push({ signInId: row.id, account: row.account.identifier, provider: row.provider.name, accountAdded: row.accountCreated });
      } catch (error) {
        if (error instanceof AppError && error.messageKey === "errors.alreadySignedIn") skipped.push(item.identifier);
        else throw error;
      }
    }
    return { place: { deviceId: device.id, device: device.name, browserProfileId: profile?.id ?? null, app }, recorded, alreadySignedIn: skipped };
  },
});

const signOutAction = actionTool({
  name: "sign_out",
  description: "Mark sign-ins as signed out (the person logged out there). They stay in the history.",
  permission: "map.write",
  input: z.object({ signInIds }),
  preview: async (input, context) => {
    const rows = await signInsByIds(input.signInIds);
    const { t } = context.i18n;
    const ended = rows.filter((row) => row.status === "signed_out").length;
    return {
      title: t("ai.action.signOut"),
      fields: rows.map((row) => ({ label: accountText(row.account, row.provider), value: placeText(row, t) })),
      note: ended > 0 ? t("ai.note.alreadySignedOut", { count: ended }) : undefined,
    };
  },
  run: async (input, context) => {
    const rows = await signInsByIds(input.signInIds);
    const done = [];
    for (const row of rows) done.push(await signOut(row.id, context.staff.id));
    return { signedOut: done.map((row) => ({ signInId: row.id, account: row.account.identifier, device: row.device.name, signedOutOn: row.signedOutAt ? localDay(row.signedOutAt) : null })) };
  },
});

const confirmInput = z.object({
  deviceId: deviceId.optional().describe("Confirm every sign-in on this device at once (the person went through it)."),
  signInIds: signInIds.optional().describe("Or confirm only these sign-ins."),
});

async function confirmTargets(input: z.output<typeof confirmInput>) {
  if ((input.deviceId === undefined) === (input.signInIds === undefined)) throw validationError("deviceId", "validation.deviceOrSignIns");
  if (input.deviceId !== undefined) {
    const device = await getDevice(input.deviceId);
    return { device, rows: await listSignIns({ deviceId: device.id }) };
  }
  return { device: null, rows: await signInsByIds(input.signInIds ?? []) };
}

const confirmSignInsAction = actionTool({
  name: "confirm_sign_ins",
  description: "Confirm that accounts are still signed in: everything on one device, or chosen sign-ins. Clears their 'to check' state.",
  permission: "map.write",
  input: confirmInput,
  preview: async (input, context) => {
    const { device, rows } = await confirmTargets(input);
    const { t } = context.i18n;
    if (device) {
      return { title: t("ai.action.confirmDevice", { device: device.name }), fields: field(t("signIns.fieldActive"), context.i18n.format.number(rows.length)) };
    }
    return {
      title: t("ai.action.confirmSignIns"),
      fields: rows.map((row) => ({ label: accountText(row.account, row.provider), value: placeText(row, t) })),
      note: rows.some((row) => row.status === "signed_out") ? t("ai.note.endedSkipped") : undefined,
    };
  },
  run: async (input, context) => {
    const { device, rows } = await confirmTargets(input);
    if (device) {
      const checked = await markDeviceChecked(device.id, context.staff.id);
      return { device: device.name, confirmed: checked.confirmed };
    }
    let confirmed = 0;
    for (const row of rows) {
      if (row.status !== "signed_in") continue;
      await confirmSignIn(row.id, context.staff.id);
      confirmed += 1;
    }
    return { confirmed, skippedSignedOut: rows.length - confirmed };
  },
});

const markForReviewAction = actionTool({
  name: "mark_for_review",
  description: "Mark sign-ins to check or sign out soon (review true), or clear that mark (review false).",
  permission: "map.write",
  input: z.object({ signInIds, review: z.boolean().optional().describe("Default true.") }),
  preview: async (input, context) => {
    const rows = (await signInsByIds(input.signInIds)).filter((row) => row.status === "signed_in");
    if (rows.length === 0) throw validationError("signInIds", "validation.signInEnded");
    const { t } = context.i18n;
    return {
      title: input.review === false ? t("ai.action.clearReview") : t("ai.action.markForReview"),
      fields: rows.map((row) => ({ label: accountText(row.account, row.provider), value: placeText(row, t) })),
    };
  },
  run: async (input, context) => {
    const rows = (await signInsByIds(input.signInIds)).filter((row) => row.status === "signed_in");
    for (const row of rows) await updateSignIn(row.id, { review: input.review !== false }, context.staff.id);
    return { updated: rows.length, review: input.review !== false };
  },
});

// ----- accounts -----

const updateAccountInput = z.object({
  accountId,
  label: z.string().max(60).optional().describe("What the owner calls it, e.g. Work. Empty to clear."),
  twoFactor: z.enum(TWO_FACTOR_STATES).optional().describe("Whether two-step verification is on."),
  notes: z.string().max(1000).optional().describe("Never passwords or codes. Empty to clear."),
});

function accountChanges(input: z.output<typeof updateAccountInput>) {
  const raw: Record<string, unknown> = {};
  if (input.label !== undefined) raw.label = input.label;
  if (input.twoFactor !== undefined) raw.twoFactor = input.twoFactor;
  if (input.notes !== undefined) raw.notes = input.notes;
  if (Object.keys(raw).length === 0) throw validationError("accountId", "validation.nothingToChange");
  return parseWith(accountUpdateSchema, raw);
}

const updateAccountAction = actionTool({
  name: "update_account",
  description: "Change an account's label, two-step verification state or notes.",
  permission: "map.write",
  input: updateAccountInput,
  preview: async (input, context) => {
    const changes = accountChanges(input);
    const account = await getAccount(input.accountId);
    const provider = await getProvider(account.providerId);
    const { t } = context.i18n;
    return {
      title: t("ai.action.updateAccount", { account: accountText(account, provider) }),
      fields: [
        ...(changes.label !== undefined ? field(t("accounts.fieldLabel"), changes.label ?? "—", account.label) : []),
        ...(changes.twoFactor !== undefined ? field(t("accounts.fieldTwoFactor"), t(TWO_FACTOR_LABELS[changes.twoFactor]), t(TWO_FACTOR_LABELS[account.twoFactor])) : []),
        ...(changes.notes !== undefined ? field(t("accounts.fieldNotes"), changes.notes ? clip(changes.notes, 200) : "—") : []),
      ],
    };
  },
  run: async (input, context) => {
    const account = await updateAccount(input.accountId, accountChanges(input), context.staff.id);
    if (!account) throw notFound();
    const provider = providerView(await getProvider(account.providerId));
    return { id: account.id, identifier: account.identifier, provider: provider.name, label: account.label, twoFactor: account.twoFactor };
  },
});

// ----- registry -----

export const AGENT_TOOLS: AgentTool[] = [
  findAccountTool,
  listDevicesTool,
  getDeviceTool,
  listAccountsTool,
  listProvidersTool,
  getOverviewTool,
  addDeviceAction,
  addProfileAction,
  addProviderAction,
  recordSignInsAction,
  signOutAction,
  confirmSignInsAction,
  markForReviewAction,
  updateAccountAction,
];

/** Tools a role may use: the same permissions as the screens. */
export function toolsFor(role: StaffRole): AgentTool[] {
  return AGENT_TOOLS.filter((tool) => can(role, tool.permission));
}

const SCHEMA_KEYS = new Set(["type", "properties", "required", "items", "enum", "description", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "pattern"]);

/** A conservative JSON Schema that every provider accepts (no $schema, additionalProperties or unions). */
function cleanSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(cleanSchema);
  if (!node || typeof node !== "object") return node;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (!SCHEMA_KEYS.has(key)) continue;
    if (key === "properties" && value && typeof value === "object") {
      result.properties = Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, cleanSchema(schema)]));
    } else if (key === "minimum" || key === "maximum") {
      // Zod writes ±MAX_SAFE_INTEGER for bare integers; that is noise for the model.
      if (Math.abs(Number(value)) < Number.MAX_SAFE_INTEGER) result[key] = value;
    } else result[key] = key === "items" ? cleanSchema(value) : value;
  }
  if (result.type === "object" && !result.properties) result.properties = {};
  return result;
}

const specCache = new Map<string, AiToolSpec>();

export function toolSpec(tool: AgentTool): AiToolSpec {
  const cached = specCache.get(tool.name);
  if (cached) return cached;
  const parameters = cleanSchema(z.toJSONSchema(tool.input, { io: "input", unrepresentable: "any" })) as Record<string, unknown>;
  const spec = { name: tool.name, description: tool.kind === "action" ? `${tool.description} Runs only after the person confirms on screen.` : tool.description, parameters };
  specCache.set(tool.name, spec);
  return spec;
}

/** Models sometimes send numbers and booleans as strings; fix the top-level ones before validation. */
export function coerceArguments(tool: AgentTool, input: Record<string, unknown>): Record<string, unknown> {
  const properties = (toolSpec(tool).parameters.properties ?? {}) as Record<string, { type?: string }>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const type = properties[key]?.type;
    if (value === null) continue;
    if ((type === "integer" || type === "number") && typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) result[key] = Number(value);
    else if (type === "boolean" && (value === "true" || value === "false")) result[key] = value === "true";
    else result[key] = value;
  }
  return result;
}
