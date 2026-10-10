import { and, eq, sql } from "drizzle-orm";
import { db, requireTenantId } from "../../shared/db";
import { AppError } from "../../shared/http/errors";
import { zonedDate } from "../../shared/time";
import { tenantById } from "../tenants/service";
import { loadAiQuotas, loadPlatformAi, loadTenantAi } from "./config";
import { AiProviderError, providerChat } from "./providers";
import { aiUsage } from "./schema";
import type { AiChatRequest, AiChatResult, AiConfig, AiProviderConfig } from "./types";

/** Which provider and model answer, and whether the platform's quota applies ("platform") or the tenant's own key ("own"). */
export type ResolvedAi = { provider: AiProviderConfig; model: string; source: "own" | "platform" };

const QUOTA_TIME_ZONE = "Asia/Jakarta";

export function currentPeriod(now: Date = new Date()): string {
  return zonedDate(now, QUOTA_TIME_ZONE).slice(0, 7);
}

function pick(config: AiConfig, model?: string | null): { provider: AiProviderConfig; model: string } | null {
  const usable = config.providers.filter((provider) => provider.enabled && provider.apiKey && provider.baseUrl);
  if (usable.length === 0) return null;
  if (model) {
    const owner = usable.find((provider) => provider.models.includes(model));
    if (owner) return { provider: owner, model };
  }
  const provider = usable.find((candidate) => candidate.id === config.defaultProviderId) ?? usable[0];
  const chosen = config.defaultModel && provider.models.includes(config.defaultModel) ? config.defaultModel : (provider.models[0] ?? config.defaultModel);
  return chosen ? { provider, model: chosen } : null;
}

/** The tenant's own key when it chose to use one, otherwise the platform's providers. Call in a tenant scope. */
export async function resolveAi(model?: string | null): Promise<ResolvedAi> {
  const own = await loadTenantAi();
  if (own.mode === "own") {
    const picked = pick(own, model);
    if (!picked) throw new AppError(409, "errors.aiNotConfigured");
    return { ...picked, source: "own" };
  }
  const picked = pick(await loadPlatformAi(), model);
  if (!picked) throw new AppError(409, "errors.aiNotConfigured");
  return { ...picked, source: "platform" };
}

/** Models people in the current tenant can choose from. */
export async function availableModels(): Promise<{ model: string; provider: string }[]> {
  const own = await loadTenantAi();
  const config = own.mode === "own" ? own : await loadPlatformAi();
  return config.providers
    .filter((provider) => provider.enabled && provider.apiKey)
    .flatMap((provider) => provider.models.map((model) => ({ model, provider: provider.label })));
}

/** Monthly AI messages a tenant may send on the platform's providers. */
export async function monthlyQuota(tenantId: number): Promise<number> {
  const [quotas, tenant] = await Promise.all([loadAiQuotas(), tenantById(tenantId)]);
  const override = quotas.byTenant[String(tenantId)];
  if (override !== undefined) return override;
  return tenant?.status === "trial" ? quotas.trialMonthly : quotas.monthly;
}

/** Counts one AI message against this month's quota in one statement; false when the quota is used up. */
async function reserveMessage(limit: number): Promise<boolean> {
  if (limit <= 0) return false;
  const rows = await db()
    .insert(aiUsage)
    .values({ period: currentPeriod(), requests: 1 })
    .onConflictDoUpdate({
      target: [aiUsage.tenantId, aiUsage.period],
      set: { requests: sql`${aiUsage.requests} + 1`, updatedAt: new Date() },
      setWhere: sql`${aiUsage.requests} < ${limit}`,
    })
    .returning({ id: aiUsage.id });
  return rows.length > 0;
}

/**
 * Starts one AI message (one question to the assistant, or one generated recap): picks the provider and, on the
 * platform's providers, takes one message from the tenant's monthly quota.
 */
export async function startAiMessage(model?: string | null): Promise<ResolvedAi> {
  const resolved = await resolveAi(model);
  if (resolved.source === "platform") {
    const limit = await monthlyQuota(requireTenantId());
    if (!(await reserveMessage(limit))) throw new AppError(429, "errors.aiQuotaExceeded", { limit });
  }
  return resolved;
}

async function recordTokens(usage: AiChatResult["usage"]): Promise<void> {
  if (!usage.inputTokens && !usage.outputTokens) return;
  await db()
    .insert(aiUsage)
    .values({ period: currentPeriod(), requests: 0, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens })
    .onConflictDoUpdate({
      target: [aiUsage.tenantId, aiUsage.period],
      set: { inputTokens: sql`${aiUsage.inputTokens} + ${usage.inputTokens}`, outputTokens: sql`${aiUsage.outputTokens} + ${usage.outputTokens}`, updatedAt: new Date() },
    });
}

/** One call to the provider; its tokens are recorded, and a provider failure becomes a translated error. */
export async function runAiChat(resolved: ResolvedAi, request: Omit<AiChatRequest, "model">): Promise<AiChatResult> {
  try {
    const result = await providerChat(resolved.provider, { ...request, model: resolved.model });
    await recordTokens(result.usage);
    return result;
  } catch (error) {
    if (error instanceof AiProviderError) {
      console.warn("[ai] provider failed", resolved.provider.label, error.status, error.message);
      throw new AppError(502, "errors.aiProviderFailed", { provider: resolved.provider.label }, { detail: error.message.slice(0, 300) });
    }
    throw error;
  }
}

/** This month's usage of the current tenant, with its quota when it uses the platform's providers. */
export async function aiUsageSummary() {
  const tenantId = requireTenantId();
  const [own, [row]] = await Promise.all([
    loadTenantAi(),
    db().select().from(aiUsage).where(and(eq(aiUsage.tenantId, tenantId), eq(aiUsage.period, currentPeriod()))).limit(1),
  ]);
  const source = own.mode === "own" ? ("own" as const) : ("platform" as const);
  return {
    period: currentPeriod(),
    source,
    requests: row?.requests ?? 0,
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
    limit: source === "platform" ? await monthlyQuota(tenantId) : null,
  };
}
