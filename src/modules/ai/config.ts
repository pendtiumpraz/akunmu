import { z } from "zod";
import { randomString } from "../../shared/crypto/tokens";
import { decryptSecret, encryptSecret } from "../../shared/crypto/secret-box";
import { asPlatform } from "../../shared/db";
import { currentScope } from "../../shared/db/scope";
import { blankToNull } from "../../shared/text";
import { recordAudit } from "../audit/service";
import { findSetting, upsertSetting } from "../settings/repository";
import {
  AI_PROVIDER_KINDS,
  DEFAULT_AI_QUOTAS,
  TENANT_AI_MODES,
  type AiConfig,
  type AiProviderConfig,
  type AiQuotaConfig,
  type TenantAiConfig,
} from "./types";

/**
 * AI provider settings. The platform's (AkunMu's own providers, set by the platform owner) and each tenant's
 * (bring your own key) are one encrypted setting each, in their own scope; API keys never leave the server.
 */
const CONFIG_KEY = "ai.config";
const QUOTA_KEY = "ai.quotas";
const CACHE_MS = 60_000;

const cache = new Map<string, { value: unknown; expiresAt: number }>();

function scopeKey(name: string): string {
  const scope = currentScope();
  return `${name}:${scope.tenantId !== null ? `tenant:${scope.tenantId}` : scope.platform ? "platform" : "none"}`;
}

export function clearAiConfigCache(): void {
  cache.clear();
}

const EMPTY_CONFIG: AiConfig = { providers: [], defaultProviderId: null, defaultModel: null };

async function readEncrypted<T>(key: string, fallback: T): Promise<T> {
  const cached = cache.get(scopeKey(key));
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const row = await findSetting(key);
  let value = fallback;
  const json = row ? (row.isSecret ? decryptSecret(row.value) : row.value) : null;
  if (json) {
    try {
      value = { ...fallback, ...(JSON.parse(json) as T) };
    } catch {
      value = fallback;
    }
  }
  cache.set(scopeKey(key), { value, expiresAt: Date.now() + CACHE_MS });
  return value;
}

async function writeEncrypted(key: string, value: unknown, secret: boolean): Promise<void> {
  const json = JSON.stringify(value);
  await upsertSetting(key, secret ? encryptSecret(json) : json, secret);
  cache.set(scopeKey(key), { value, expiresAt: Date.now() + CACHE_MS });
}

// ----- validation -----

const providerInput = z.object({
  id: z.preprocess(blankToNull, z.string().max(40).nullish()),
  preset: z.string().trim().min(1).max(40),
  kind: z.enum(AI_PROVIDER_KINDS),
  label: z.string().trim().min(1).max(80),
  baseUrl: z.string().trim().url({ error: "validation.url" }).max(300),
  /** Blank keeps the stored key. */
  apiKey: z.preprocess(blankToNull, z.string().trim().max(500).nullish()),
  models: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  enabled: z.boolean().default(true),
});

export const aiConfigInputSchema = z.object({
  providers: z.array(providerInput).max(20).default([]),
  defaultProviderId: z.preprocess(blankToNull, z.string().max(40).nullish()),
  defaultModel: z.preprocess(blankToNull, z.string().trim().max(120).nullish()),
});
export const tenantAiInputSchema = aiConfigInputSchema.extend({ mode: z.enum(TENANT_AI_MODES).default("platform") });
export const aiQuotaInputSchema = z.object({
  monthly: z.coerce.number().int().min(0).max(1_000_000),
  trialMonthly: z.coerce.number().int().min(0).max(1_000_000),
  byTenant: z.record(z.string().regex(/^\d+$/), z.coerce.number().int().min(0).max(1_000_000)).default({}),
});
export type AiConfigInput = z.infer<typeof aiConfigInputSchema>;
export type TenantAiInput = z.infer<typeof tenantAiInputSchema>;
export type ProviderInput = z.infer<typeof providerInput>;

/** Merges submitted providers with the stored ones: new ones get an id, a blank key keeps the stored key. */
function mergeProviders(input: ProviderInput[], stored: AiProviderConfig[]): AiProviderConfig[] {
  return input.map((provider) => {
    const previous = provider.id ? stored.find((candidate) => candidate.id === provider.id) : undefined;
    return {
      id: previous?.id ?? `p_${randomString(10).toLowerCase()}`,
      preset: provider.preset,
      kind: provider.kind,
      label: provider.label,
      baseUrl: provider.baseUrl.replace(/\/+$/, ""),
      apiKey: provider.apiKey ?? previous?.apiKey ?? null,
      models: [...new Set(provider.models)],
      enabled: provider.enabled,
    };
  });
}

/** Settings for the admin screens: each key is replaced by whether one is stored. */
export function maskConfig<T extends AiConfig>(config: T) {
  return { ...config, providers: config.providers.map(({ apiKey, ...rest }) => ({ ...rest, apiKey: null, hasKey: Boolean(apiKey) })) };
}

/** A submitted provider completed with the stored key, for testing or listing models before saving. */
export function withStoredKey(input: ProviderInput, stored: AiProviderConfig[]): AiProviderConfig {
  return mergeProviders([input], stored)[0];
}

// ----- platform -----

export function loadPlatformAi(): Promise<AiConfig> {
  return asPlatform(() => readEncrypted<AiConfig>(CONFIG_KEY, EMPTY_CONFIG));
}

export function loadAiQuotas(): Promise<AiQuotaConfig> {
  return asPlatform(() => readEncrypted<AiQuotaConfig>(QUOTA_KEY, DEFAULT_AI_QUOTAS));
}

export async function savePlatformAi(input: AiConfigInput, actorId: number) {
  return asPlatform(async () => {
    const current = await loadPlatformAi();
    const providers = mergeProviders(input.providers, current.providers);
    const config: AiConfig = {
      providers,
      defaultProviderId: providers.some((provider) => provider.id === input.defaultProviderId) ? (input.defaultProviderId ?? null) : (providers[0]?.id ?? null),
      defaultModel: input.defaultModel ?? null,
    };
    await writeEncrypted(CONFIG_KEY, config, true);
    await recordAudit({ actorType: "staff", actorId, action: "platform.ai_updated", subjectType: "setting", meta: { providers: providers.map((provider) => provider.label) } });
    return maskConfig(config);
  });
}

export async function saveAiQuotas(input: AiQuotaConfig, actorId: number) {
  return asPlatform(async () => {
    await writeEncrypted(QUOTA_KEY, input, false);
    await recordAudit({ actorType: "staff", actorId, action: "platform.ai_quotas_updated", subjectType: "setting", meta: { monthly: input.monthly, trialMonthly: input.trialMonthly } });
    return input;
  });
}

// ----- tenant (current scope) -----

export function loadTenantAi(): Promise<TenantAiConfig> {
  return readEncrypted<TenantAiConfig>(CONFIG_KEY, { ...EMPTY_CONFIG, mode: "platform" });
}

export async function saveTenantAi(input: TenantAiInput, actorId: number) {
  const current = await loadTenantAi();
  const providers = mergeProviders(input.providers, current.providers);
  const config: TenantAiConfig = {
    mode: input.mode,
    providers,
    defaultProviderId: providers.some((provider) => provider.id === input.defaultProviderId) ? (input.defaultProviderId ?? null) : (providers[0]?.id ?? null),
    defaultModel: input.defaultModel ?? null,
  };
  await writeEncrypted(CONFIG_KEY, config, true);
  await recordAudit({ actorType: "staff", actorId, action: "settings.ai_updated", subjectType: "setting", meta: { mode: config.mode } });
  return maskConfig(config);
}
