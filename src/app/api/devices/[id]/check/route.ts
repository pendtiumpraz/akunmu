import { staffRoute } from "@/server/route";
import { markDeviceChecked } from "@/modules/devices/service";
import { parseId } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

/** "I went through this device": confirms every active sign-in on it. */
export const POST = staffRoute<{ id: string }>("map.write", async ({ params, staff, i18n }) =>
  ok(await markDeviceChecked(parseId(params.id), staff.user.id), i18n.t("devices.checkedMessage")),
);
