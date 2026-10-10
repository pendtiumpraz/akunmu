import { publicRoute } from "@/server/route";
import { endStaffSession } from "@/modules/users/session";
import { ok } from "@/shared/http/respond";

export const POST = publicRoute(async ({ i18n }) => {
  await endStaffSession();
  return ok(null, i18n.t("api.loggedOut"));
});
