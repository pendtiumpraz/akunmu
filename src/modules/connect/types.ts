import type { Browser, DeviceSystem } from "../devices/types";

/**
 * Findings: what the browser extension or the desktop app saw that is not in the map yet. Each waits for the owner to
 * accept it (it is then recorded through the usual services) or dismiss it (it stays dismissed when seen again).
 */
export const FINDING_KINDS = ["device", "profile", "sign_in"] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export const FINDING_STATUSES = ["new", "accepted", "dismissed"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const AGENT_KINDS = ["extension", "desktop"] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

/** Who reported with a key last, and from which browser profile. */
export type LastReport = { agent: AgentKind; version: string; browser: Browser; profile: string };

/** What a finding describes; a device-less finding names the computer by its host name (desktop scans). */
export type FindingPayload = {
  hostname?: string | null;
  system?: DeviceSystem | null;
  browser?: Browser | null;
  /** The browser profile as the browser shows it; its folder when known (desktop scan) and its Google account. */
  profile?: { name: string; directory?: string | null; email?: string | null } | null;
  /** The site an account is signed in to, by domain (matched to a provider when the finding is accepted). */
  provider?: { domain: string; name?: string | null } | null;
  /** The account's email or user name, when the agent could read it. */
  identifier?: string | null;
};

/** Browsers whose profiles AkunMu Desktop can open by folder (Chromium browsers; see local-browsers.ts). */
export const OPENABLE_BROWSERS: readonly Browser[] = ["chrome", "edge", "brave", "vivaldi"];
