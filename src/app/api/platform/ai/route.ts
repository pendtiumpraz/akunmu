import { platformRoute } from "@/server/route";
import { aiConfigInputSchema, loadAiQuotas, loadPlatformAi, maskConfig, savePlatformAi } from "@/modules/ai/config";
import { platformAiUsage } from "@/modules/ai/probe";
import { AI_PRESETS } from "@/modules/ai/types";
import { readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

/** AkunMu's own AI providers (keys write-only), the monthly quotas and this month's usage per workspace. */
export const GET = platformRoute(async () => {
  const [config, quotas, usage] = await Promise.all([loadPlatformAi(), loadAiQuotas(), platformAiUsage()]);
  return ok({ config: maskConfig(config), quotas, usage, presets: AI_PRESETS }, "", 200, { "Cache-Control": "no-store" });
});

export const PUT = platformRoute(async ({ request, staff, i18n }) => {
  const input = parseWith(aiConfigInputSchema, await readJson(request));
  return ok(await savePlatformAi(input, staff.user.id), i18n.t("api.updated"));
});
