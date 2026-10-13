import type { RiskCategory, Score3, Score5, Treatment } from "./risk";

/**
 * Catalog of the processing activities AkunMu performs, derived from what the application actually stores
 * (the schema of each module), not filled in by hand. Each entry becomes one RoPA record; staff complete or
 * correct it, and the stored corrections win over these defaults.
 *
 * - scope "tenant":   the workspace (its admins) is the controller; AkunMu processes on its behalf.
 * - scope "platform": AkunMu's operator is the controller (accounts, sign-up, security, AI gateway).
 *
 * The platform's processor record (PP 33/2026 Art. 74(5)) is built from the tenant entries.
 * Texts (names, purposes, data categories, flows) live per language in src/content/compliance.
 */

/** High-risk criteria of UU PDP Art. 34(2) and PP 33/2026 Art. 120(2); one "yes" makes a DPIA mandatory. */
export const DPIA_CRITERIA = [
  "automated_decision",
  "specific_data",
  "large_scale",
  "systematic_evaluation",
  "data_matching",
  "new_technology",
  "rights_restriction",
] as const;

export type DpiaCriterion = (typeof DPIA_CRITERIA)[number];

/**
 * Systems the data of an activity passes through; locations are detected at runtime (see hosting.ts).
 * "client" is the user's own device (browser extension, AkunMu Desktop): listed as a system, never a transfer.
 */
export const INFRASTRUCTURE = ["app", "database", "storage", "ai", "client"] as const;
export type Infrastructure = (typeof INFRASTRUCTURE)[number];

/** Components that run on the data subject's own device and therefore never count as a transfer abroad. */
export const LOCAL_INFRASTRUCTURE: readonly Infrastructure[] = ["client"];

/** Aggregate counters behind activities (row counts only; record contents are never read). */
export const STAT_KEYS = [
  "devices",
  "browserProfiles",
  "accounts",
  "signIns",
  "findings",
  "ingestTokens",
  "conversations",
  "privacyRequests",
  "staff",
  "tenants",
  "accountConsents",
  "auditLogs",
  "aiUsage",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export type RiskTemplate = {
  id: string;
  category: RiskCategory;
  impact: Score5;
  likelihood: Score5;
  control: Score3;
  treatment: Treatment;
};

export type ActivityScope = "tenant" | "platform";

export type ActivityDefinition = {
  key: string;
  scope: ActivityScope;
  /** Short code used in the registration number (RoPA-DEV, DPIA-DEV). */
  code: string;
  /** Counters shown as the volume; the first one decides "in use" and the large-scale hint. */
  stats: StatKey[];
  /** Criteria the processing meets by design. */
  criteria: DpiaCriterion[];
  infrastructure: Infrastructure[];
  /** Default DPIA risk register; event and mitigation texts come from the content files. */
  risks: RiskTemplate[];
};

/** More records than this in 30 days suggests "large scale" (the DPIA standard's threshold note). */
export const LARGE_SCALE_MONTHLY = 1000;

export const ACTIVITIES: readonly ActivityDefinition[] = [
  {
    key: "devices",
    scope: "tenant",
    code: "DEV",
    stats: ["devices", "browserProfiles"],
    criteria: [],
    infrastructure: ["app", "database", "client"],
    risks: [
      { id: "location-exposed", category: "authorization", impact: 3, likelihood: 2, control: 2, treatment: "mitigate" },
      { id: "stale-inventory", category: "data_quality", impact: 2, likelihood: 3, control: 2, treatment: "mitigate" },
    ],
  },
  {
    key: "accounts",
    scope: "tenant",
    code: "ACC",
    stats: ["accounts"],
    criteria: ["data_matching"],
    infrastructure: ["app", "database"],
    risks: [
      { id: "secret-in-notes", category: "data_minimization", impact: 5, likelihood: 1, control: 3, treatment: "mitigate" },
      { id: "identity-profile", category: "authorization", impact: 4, likelihood: 2, control: 2, treatment: "mitigate" },
      { id: "kept-too-long", category: "retention", impact: 2, likelihood: 3, control: 2, treatment: "mitigate" },
    ],
  },
  {
    key: "signins",
    scope: "tenant",
    code: "SIN",
    stats: ["signIns"],
    criteria: ["data_matching"],
    // storage: the screenshots of the projects the sessions work on.
    infrastructure: ["app", "database", "storage"],
    risks: [
      { id: "takeover-map", category: "authorization", impact: 4, likelihood: 2, control: 2, treatment: "mitigate" },
      { id: "outdated-status", category: "data_quality", impact: 2, likelihood: 3, control: 2, treatment: "mitigate" },
    ],
  },
  {
    key: "connect",
    scope: "tenant",
    code: "EXT",
    stats: ["findings", "ingestTokens"],
    criteria: ["systematic_evaluation"],
    infrastructure: ["app", "database", "client"],
    risks: [
      { id: "token-leak", category: "authentication", impact: 4, likelihood: 2, control: 3, treatment: "mitigate" },
      { id: "over-collection", category: "data_minimization", impact: 4, likelihood: 2, control: 3, treatment: "mitigate" },
      { id: "monitoring-without-notice", category: "privacy_notice", impact: 4, likelihood: 2, control: 2, treatment: "mitigate" },
      { id: "findings-kept", category: "retention", impact: 2, likelihood: 3, control: 1, treatment: "mitigate" },
    ],
  },
  {
    key: "assistant",
    scope: "tenant",
    code: "AIA",
    stats: ["conversations"],
    criteria: ["new_technology"],
    infrastructure: ["app", "database", "ai"],
    risks: [
      { id: "prompt-abroad", category: "cross_border", impact: 3, likelihood: 3, control: 2, treatment: "mitigate" },
      { id: "unconfirmed-change", category: "authorization", impact: 3, likelihood: 2, control: 3, treatment: "accept" },
      { id: "secret-to-ai", category: "data_minimization", impact: 5, likelihood: 1, control: 3, treatment: "mitigate" },
    ],
  },
  {
    key: "requests",
    scope: "tenant",
    code: "DSR",
    stats: ["privacyRequests"],
    criteria: [],
    infrastructure: ["app", "database"],
    risks: [
      { id: "missed-deadline", category: "subject_rights", impact: 3, likelihood: 2, control: 2, treatment: "mitigate" },
      { id: "impersonation", category: "data_verification", impact: 4, likelihood: 2, control: 2, treatment: "mitigate" },
    ],
  },
  {
    key: "platform-accounts",
    scope: "platform",
    code: "USR",
    stats: ["staff"],
    criteria: [],
    infrastructure: ["app", "database"],
    risks: [
      { id: "credential-theft", category: "authentication", impact: 4, likelihood: 2, control: 2, treatment: "mitigate" },
      { id: "stale-accounts", category: "retention", impact: 2, likelihood: 3, control: 2, treatment: "mitigate" },
    ],
  },
  {
    key: "platform-signup",
    scope: "platform",
    code: "WSP",
    stats: ["tenants", "accountConsents"],
    criteria: [],
    infrastructure: ["app", "database"],
    risks: [
      { id: "marketing-without-consent", category: "legal_basis", impact: 2, likelihood: 2, control: 3, treatment: "accept" },
      { id: "fake-signup", category: "data_verification", impact: 2, likelihood: 3, control: 2, treatment: "mitigate" },
    ],
  },
  {
    key: "platform-security",
    scope: "platform",
    code: "AUD",
    stats: ["auditLogs"],
    criteria: [],
    infrastructure: ["app", "database"],
    risks: [
      { id: "log-overcollection", category: "data_minimization", impact: 2, likelihood: 2, control: 3, treatment: "accept" },
      { id: "log-kept-forever", category: "retention", impact: 2, likelihood: 3, control: 2, treatment: "mitigate" },
    ],
  },
  {
    key: "platform-ai",
    scope: "platform",
    code: "AIG",
    stats: ["aiUsage"],
    criteria: ["new_technology"],
    infrastructure: ["app", "database", "ai"],
    risks: [
      { id: "provider-retention", category: "third_parties", impact: 3, likelihood: 2, control: 2, treatment: "mitigate" },
      { id: "transfer-abroad", category: "cross_border", impact: 3, likelihood: 3, control: 2, treatment: "mitigate" },
    ],
  },
];

export function activityByKey(key: string): ActivityDefinition | undefined {
  return ACTIVITIES.find((activity) => activity.key === key);
}

export function activitiesForScope(scope: ActivityScope): ActivityDefinition[] {
  return ACTIVITIES.filter((activity) => activity.scope === scope);
}

/** Prefix of the platform's processor records (one per tenant activity). */
export const PROCESSOR_PREFIX = "processor:";

export function processorKey(activityKey: string): string {
  return `${PROCESSOR_PREFIX}${activityKey}`;
}

export function isProcessorKey(key: string): boolean {
  return key.startsWith(PROCESSOR_PREFIX);
}

/** Prefix of activities staff add themselves. */
export const CUSTOM_PREFIX = "custom-";

export function isCustomKey(key: string): boolean {
  return key.startsWith(CUSTOM_PREFIX);
}
