import { dismissFinding } from "@/modules/connect/service";
import { staffRoute } from "@/server/route";
import { parseId } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

/** Not wanted in the map: the finding stays dismissed when it is seen again. */
export const POST = staffRoute<{ id: string }>("map.write", async ({ params, staff, i18n }) => {
  await dismissFinding(parseId(params.id), staff.user.id);
  return ok(null, i18n.t("api.findingDismissed"));
});
