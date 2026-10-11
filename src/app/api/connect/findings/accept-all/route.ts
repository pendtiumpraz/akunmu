import { acceptAllFindings } from "@/modules/connect/service";
import { staffRoute } from "@/server/route";
import { ok } from "@/shared/http/respond";

/** Accepts every finding that needs nothing more; sign-ins found without their account wait for one. */
export const POST = staffRoute("map.write", async ({ staff, i18n }) => {
  const result = await acceptAllFindings(staff.user.id);
  return ok(result, i18n.t("api.findingsAccepted", { count: result.accepted }));
});
