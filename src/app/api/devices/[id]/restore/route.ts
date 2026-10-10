import { staffRoute } from "@/server/route";
import { restoreDevice } from "@/modules/devices/service";
import { parseId } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

export const PATCH = staffRoute<{ id: string }>("map.write", async ({ params, staff, i18n }) =>
  ok(await restoreDevice(parseId(params.id), staff.user.id), i18n.t("api.restored")),
);
