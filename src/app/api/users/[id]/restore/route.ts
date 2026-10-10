import { staffRoute } from "@/server/route";
import { restoreStaff } from "@/modules/users/service";
import { parseId } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

export const PATCH = staffRoute<{ id: string }>("users.manage", async ({ params, staff, i18n }) =>
  ok(await restoreStaff(parseId(params.id), staff.user.id), i18n.t("api.restored")),
);
