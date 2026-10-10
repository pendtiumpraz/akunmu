import { and, asc, eq, isNull } from "drizzle-orm";
import { asPlatform, db } from "../../shared/db";
import { tenants } from "../tenants/schema";
import { withStoredKey, type ProviderInput } from "./config";
import { currentPeriod } from "./gateway";
import { AiProviderError, providerChat, providerModels } from "./providers";
import { aiUsage } from "./schema";
import type { AiProviderConfig } from "./types";

/**
 * Tests a provider from the settings form (one short message) or loads its model list, using the stored key
 * when the form leaves the key empty. Provider errors come back as text for the form, not as failures.
 */
export async function probeProvider(input: ProviderInput, stored: AiProviderConfig[], action: "test" | "models") {
  const provider = withStoredKey(input, stored);
  try {
    if (action === "models") return { ok: true as const, models: await providerModels(provider) };
    const model = provider.models[0];
    if (!model) return { ok: false as const, error: "no model" };
    const started = Date.now();
    // Room for adaptive thinking, which Claude 5.x models may use even for a one-word reply.
    await providerChat(provider, { model, maxTokens: 1024, effort: "low", turns: [{ role: "user", content: "Reply with the single word: ok" }] });
    return { ok: true as const, model, ms: Date.now() - started };
  } catch (error) {
    if (error instanceof AiProviderError) return { ok: false as const, error: `${error.status ? `HTTP ${error.status}: ` : ""}${error.message}`.slice(0, 300) };
    throw error;
  }
}

/** This month's AI usage of every workspace, for the platform console (awaited inside the platform scope). */
export function platformAiUsage() {
  return asPlatform(
    async () =>
      await db()
        .select({ tenantId: tenants.id, name: tenants.name, slug: tenants.slug, status: tenants.status, requests: aiUsage.requests })
        .from(tenants)
        .leftJoin(aiUsage, and(eq(aiUsage.tenantId, tenants.id), eq(aiUsage.period, currentPeriod())))
        .where(isNull(tenants.deletedAt))
        .orderBy(asc(tenants.name)),
  );
}
