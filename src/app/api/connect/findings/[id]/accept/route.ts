import { acceptFinding } from "@/modules/connect/service";
import { acceptFindingSchema } from "@/modules/connect/validation";
import { staffRoute } from "@/server/route";
import { parseId, readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

/** Records what the finding describes (with the account's name when it was found without one). */
export const POST = staffRoute<{ id: string }>("map.write", async ({ request, params, staff, i18n }) => {
  const input = parseWith(acceptFindingSchema, await readJson(request));
  await acceptFinding(parseId(params.id), input, staff.user.id);
  return ok(null, i18n.t("api.findingAccepted"));
});
