import { platformRoute } from "@/server/route";
import { aiQuotaInputSchema, saveAiQuotas } from "@/modules/ai/config";
import { readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

export const PUT = platformRoute(async ({ request, staff, i18n }) => {
  const input = parseWith(aiQuotaInputSchema, await readJson(request));
  return ok(await saveAiQuotas(input, staff.user.id), i18n.t("api.updated"));
});
