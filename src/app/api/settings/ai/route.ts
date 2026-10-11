import { staffRoute } from "@/server/route";
import { loadTenantAi, maskConfig, saveTenantAi, tenantAiInputSchema } from "@/modules/ai/config";
import { aiUsageSummary, monthlyQuota } from "@/modules/ai/gateway";
import { AI_PRESETS } from "@/modules/ai/types";
import { isDesktop } from "@/shared/env";
import { readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

/**
 * The workspace's AI choice (AkunMu's AI or its own key), its keys write-only, and this month's usage. The desktop app
 * has no AkunMu AI, so there the workspace always uses its own key (`ownOnly`).
 */
export const GET = staffRoute("settings.manage", async ({ staff }) => {
  const [config, usage, platformLimit] = await Promise.all([loadTenantAi(), aiUsageSummary(), monthlyQuota(staff.tenantId)]);
  const ownOnly = isDesktop();
  return ok({ config: maskConfig(ownOnly ? { ...config, mode: "own" as const } : config), usage, platformLimit, presets: AI_PRESETS, ownOnly }, "", 200, {
    "Cache-Control": "no-store",
  });
});

export const PUT = staffRoute("settings.manage", async ({ request, staff, i18n }) => {
  const input = parseWith(tenantAiInputSchema, await readJson(request));
  return ok(await saveTenantAi(isDesktop() ? { ...input, mode: "own" } : input, staff.user.id), i18n.t("api.updated"));
});
