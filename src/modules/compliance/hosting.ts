import { databaseHost, vercelRegion } from "../../shared/env";
import { LOCAL_INFRASTRUCTURE, type Infrastructure } from "./catalog";
import { fillPlaceholders, type CommonContent } from "./content";

/**
 * Where the data of an activity is processed. Locations are detected from the running deployment (the
 * Vercel function region and the Neon database host) and from the configured AI providers; the platform
 * operator can override any of them in platform Settings. The user's own device (extension, desktop app)
 * is listed as a system but never counted as a transfer.
 */

/** Cloud regions located in Indonesia. */
const INDONESIAN_REGIONS = new Set(["ap-southeast-3"]);

export type AiProviderSummary = { label: string; preset: string; baseUrl: string };

export type HostingContext = {
  aiProviders: AiProviderSummary[];
  /** Operator overrides per component (platform Settings → Data locations). */
  overrides: Partial<Record<Infrastructure, string>>;
};

export type InfrastructureLocation = {
  component: Infrastructure;
  name: string;
  role: string;
  location: string;
  /** true inside Indonesia, false outside, null when unknown. */
  inIndonesia: boolean | null;
};

/** Region of a Neon host such as ep-x-pooler.ap-southeast-1.aws.neon.tech or ep-x.eastus2.azure.neon.tech. */
export function neonRegion(host: string | undefined): string | null {
  if (!host) return null;
  const match = /\.([a-z0-9-]+)\.(aws|azure)\.neon\.tech$/.exec(host);
  return match ? match[1] : null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function regionLocation(code: string | null | undefined, common: CommonContent): { location: string; inIndonesia: boolean | null } {
  if (!code) return { location: common.location.unknown, inIndonesia: null };
  const place = common.regions[code] ?? code;
  return { location: fillPlaceholders(common.location.detected, { place: `${place} (${code})` }), inIndonesia: INDONESIAN_REGIONS.has(code) };
}

export function describeInfrastructure(components: readonly Infrastructure[], common: CommonContent, context: HostingContext): InfrastructureLocation[] {
  return components.map((component) => {
    const base = { component, name: common.infrastructure[component].name, role: common.infrastructure[component].role };
    const override = context.overrides[component]?.trim();
    if (override) return { ...base, location: override, inIndonesia: /indonesia/i.test(override) ? true : null };
    switch (component) {
      case "app":
        return { ...base, ...regionLocation(vercelRegion(), common) };
      case "database":
        return { ...base, ...regionLocation(neonRegion(databaseHost()), common) };
      // A Blob store's region cannot be read from its token: the operator states it in platform Settings.
      case "storage":
        return { ...base, ...regionLocation(null, common) };
      case "client":
        return { ...base, location: common.location.client, inIndonesia: null };
      case "ai": {
        if (context.aiProviders.length === 0) return { ...base, location: common.location.aiNone, inIndonesia: null };
        const places = context.aiProviders.map((provider) => {
          const country = common.aiProviders[provider.preset];
          const place = country ?? fillPlaceholders(common.location.providerHost, { host: hostOf(provider.baseUrl) });
          return { text: fillPlaceholders(common.location.aiProvider, { provider: provider.label, place }), known: Boolean(country) };
        });
        return { ...base, location: places.map((place) => place.text).join("; "), inIndonesia: places.every((place) => place.known) ? false : null };
      }
    }
  });
}

/** One line per component: "Name — role: location". */
export function infrastructureLines(locations: InfrastructureLocation[]): string[] {
  return locations.map((entry) => `${entry.name} — ${entry.role}: ${entry.location}`);
}

/** Components that may count as a transfer abroad (not inside Indonesia, not the user's own device). */
export function transferCandidates(locations: InfrastructureLocation[]): InfrastructureLocation[] {
  return locations.filter((entry) => entry.inIndonesia !== true && !LOCAL_INFRASTRUCTURE.includes(entry.component));
}

/** Cross-border transfer summary for RoPA section VI. */
export function transferSummary(locations: InfrastructureLocation[], common: CommonContent): { answer: string; details: string; destinations: string[] } {
  const outside = transferCandidates(locations);
  if (outside.length === 0) return { answer: common.transfer.inside, details: common.transfer.none, destinations: [] };
  return {
    answer: common.transfer.outside,
    details: `${common.transfer.intro}\n${infrastructureLines(outside).join("\n")}\n${common.transfer.safeguards}`,
    destinations: outside.map((entry) => `${entry.name}: ${entry.location}`),
  };
}
