import { z } from "zod";
import { platformContactEmail, platformOperatorName } from "../../shared/env";
import { currentTenantId } from "../../shared/db";
import { recordAudit } from "../audit/service";
import { findSetting, upsertSetting } from "../settings/repository";
import { tenantById } from "../tenants/service";
import { INFRASTRUCTURE, type Infrastructure } from "./catalog";

/**
 * Controller identity and privacy officer (PPDP) shown in RoPA and DPIA documents and privacy notices, plus
 * retention periods. Stored as settings of the current scope: a tenant's own values, or the platform's
 * (tenant_id null) for the operator.
 */
const PROFILE_KEY = "privacy.profile";
const RETENTION_KEY = "privacy.retention";

export type PrivacyProfile = {
  legalName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  dpoName: string;
  dpoEmail: string;
  dpoPhone: string;
  /** Default person in charge and unit for activities without their own. */
  picName: string;
  picRole: string;
  picEmail: string;
  unit: string;
  /** Platform only: data locations that cannot be detected (e.g. the Blob store region). */
  locations: Partial<Record<Infrastructure, string>>;
};

export type RetentionPolicy = {
  /** Workspace: delete accepted or ignored extension findings this many days after they were processed (null = off). */
  findingDays: number | null;
  /** Workspace: delete signed-out sessions this many days after sign-out. */
  signedOutDays: number | null;
  /** Workspace: delete assistant conversations inactive for this many days. */
  aiDays: number | null;
  /** Platform: delete audit log entries older than this many days. */
  auditDays: number | null;
};

const text = (max: number) => z.string().trim().max(max).default("");
const optionalEmail = z.union([z.literal(""), z.email({ error: "validation.email" }).max(200)]).default("");
const days = z.number().int().min(1).max(3650).nullable().default(null);

export const privacyProfileInputSchema = z.object({
  legalName: text(200),
  address: text(500),
  phone: text(40),
  email: optionalEmail,
  website: text(200),
  dpoName: text(120),
  dpoEmail: optionalEmail,
  dpoPhone: text(40),
  picName: text(120),
  picRole: text(120),
  picEmail: optionalEmail,
  unit: text(120),
  locations: z.partialRecord(z.enum(INFRASTRUCTURE), z.string().trim().max(300)).default({}),
});

export const retentionInputSchema = z.object({
  findingDays: days,
  signedOutDays: days,
  aiDays: days,
  auditDays: days,
});

export type PrivacyProfileInput = z.infer<typeof privacyProfileInputSchema>;
export type RetentionInput = z.infer<typeof retentionInputSchema>;

const EMPTY_PROFILE: PrivacyProfile = {
  legalName: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  dpoName: "",
  dpoEmail: "",
  dpoPhone: "",
  picName: "",
  picRole: "",
  picEmail: "",
  unit: "",
  locations: {},
};

const EMPTY_RETENTION: RetentionPolicy = { findingDays: null, signedOutDays: null, aiDays: null, auditDays: null };

async function readJson<T extends object>(key: string, fallback: T): Promise<T> {
  const row = await findSetting(key);
  if (!row) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(row.value) as Partial<T>) };
  } catch {
    return fallback;
  }
}

/** Stored profile of the current scope, without defaults. */
export function loadStoredProfile(): Promise<PrivacyProfile> {
  return readJson(PROFILE_KEY, EMPTY_PROFILE);
}

/**
 * Profile with defaults filled in: a workspace's legal name and contact email from its record,
 * the platform's from PLATFORM_OPERATOR_NAME and PLATFORM_CONTACT_EMAIL.
 */
export async function loadPrivacyProfile(): Promise<PrivacyProfile> {
  const stored = await loadStoredProfile();
  const tenantId = currentTenantId();
  if (tenantId === null) {
    return {
      ...stored,
      legalName: stored.legalName || platformOperatorName(),
      email: stored.email || platformContactEmail() || "",
    };
  }
  const tenant = await tenantById(tenantId);
  return {
    ...stored,
    legalName: stored.legalName || tenant?.legalName || tenant?.name || "",
    email: stored.email || tenant?.contactEmail || "",
  };
}

export async function savePrivacyProfile(input: PrivacyProfileInput, actorId: number): Promise<PrivacyProfile> {
  const value: PrivacyProfile = { ...EMPTY_PROFILE, ...input, locations: currentTenantId() === null ? input.locations : {} };
  await upsertSetting(PROFILE_KEY, JSON.stringify(value), false);
  await recordAudit({ actorType: "staff", actorId, action: "settings.privacy_profile_updated", subjectType: "setting" });
  return loadPrivacyProfile();
}

export function loadRetentionPolicy(): Promise<RetentionPolicy> {
  return readJson(RETENTION_KEY, EMPTY_RETENTION);
}

export async function saveRetentionPolicy(input: RetentionInput, actorId: number): Promise<RetentionPolicy> {
  const platform = currentTenantId() === null;
  // Each scope only keeps the periods it governs.
  const value: RetentionPolicy = platform
    ? { ...EMPTY_RETENTION, auditDays: input.auditDays }
    : { ...EMPTY_RETENTION, findingDays: input.findingDays, signedOutDays: input.signedOutDays, aiDays: input.aiDays };
  await upsertSetting(RETENTION_KEY, JSON.stringify(value), false);
  await recordAudit({ actorType: "staff", actorId, action: "settings.retention_updated", subjectType: "setting", meta: value });
  return value;
}
