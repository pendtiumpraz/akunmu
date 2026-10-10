import { platformRoute } from "@/server/route";
import { getPlatformStaff, restoreStaff } from "@/modules/users/service";
import { parseId } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

export const PATCH = platformRoute<{ id: string }>(async ({ params, staff, i18n }) => {
  await getPlatformStaff(parseId(params.id), { withTrashed: true });
  return ok(await restoreStaff(parseId(params.id), staff.user.id), i18n.t("api.restored"));
});
