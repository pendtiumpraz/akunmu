import { SOURCE_LOCALE, type Locale } from "../../shared/i18n/locales";
import type { Infrastructure } from "./catalog";

/**
 * Texts of the processing-activity catalog, one JSON file per language under src/content/compliance
 * (activities.<locale>.json, common.<locale>.json). A missing language falls back to the source language,
 * so adding a language means adding files only.
 */

export type ActivityContent = {
  name: string;
  description: string;
  purpose: string;
  processing: string;
  legalBasis: string;
  subjects: string[];
  dataGeneral: string[];
  dataSpecific: string[];
  source: string;
  recipientsInternal: string[];
  recipientsExternal: string[];
  retention: string;
  deletion: string;
  security: string[];
  rights: string[];
  flow: string[];
  automatedDecision: string;
  profiling: string;
  interests: string;
  necessity: string;
  proportionality: string;
  risks: Record<string, { event: string; mitigation: string }>;
};

export type CommonContent = {
  infrastructure: Record<Infrastructure, { name: string; role: string }>;
  location: {
    detected: string;
    unknown: string;
    /** Wording for public pages while a location is still unknown (no admin instructions). */
    unknownPublic: string;
    client: string;
    aiProvider: string;
    aiNone: string;
    providerHost: string;
  };
  regions: Record<string, string>;
  aiProviders: Record<string, string>;
  retention: Record<
    "workspace" | "findingsOff" | "findingsDays" | "signInsOff" | "signInsDays" | "auditOff" | "auditDays" | "aiOff" | "aiDays" | "publicUnset",
    string
  >;
  transfer: { none: string; intro: string; safeguards: string; outside: string; inside: string };
  processor: { scope: string; instructions: string; subprocessors: string; security: string; controllers: string; records: string };
  status: { inUse: string; notUsed: string };
};

export type ComplianceContent = { activities: Record<string, ActivityContent>; common: CommonContent };

const cache = new Map<string, Promise<ComplianceContent>>();

async function importJson<T>(name: "activities" | "common", locale: string): Promise<T | null> {
  try {
    const loaded = (await import(`../../content/compliance/${name}.${locale}.json`)) as { default: T };
    return loaded.default;
  } catch {
    return null;
  }
}

async function load(locale: Locale): Promise<ComplianceContent> {
  const [activities, common, sourceActivities, sourceCommon] = await Promise.all([
    importJson<Record<string, ActivityContent>>("activities", locale),
    importJson<CommonContent>("common", locale),
    importJson<Record<string, ActivityContent>>("activities", SOURCE_LOCALE),
    importJson<CommonContent>("common", SOURCE_LOCALE),
  ]);
  if (!sourceActivities || !sourceCommon) throw new Error("Compliance content for the source language is missing.");
  return { activities: { ...sourceActivities, ...(activities ?? {}) }, common: common ?? sourceCommon };
}

/** Catalog texts in the requested language (falling back to the source language). */
export function complianceContent(locale: Locale): Promise<ComplianceContent> {
  let entry = cache.get(locale);
  if (!entry) {
    entry = load(locale).catch((error: unknown) => {
      cache.delete(locale);
      throw error;
    });
    cache.set(locale, entry);
  }
  return entry;
}

/** Fills {name} placeholders; unknown names stay as they are. */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}
