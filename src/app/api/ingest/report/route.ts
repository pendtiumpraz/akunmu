import { applyReport } from "@/modules/connect/service";
import { ingestReportSchema } from "@/modules/connect/validation";
import { ingestRoute } from "@/server/route";
import { readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

/** One browser profile as the extension saw it; answers what was confirmed, found and marked for a check. */
export const POST = ingestRoute(async ({ request, token, i18n }) => {
  const report = parseWith(ingestReportSchema, await readJson(request));
  return ok(await applyReport(token, report), i18n.t("api.reportReceived"));
});
