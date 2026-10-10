import { staffRoute } from "@/server/route";
import { createDevice, listDevicesView } from "@/modules/devices/service";
import { deviceInputSchema } from "@/modules/devices/validation";
import { readJson } from "@/shared/http/request";
import { created, ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

export const GET = staffRoute("map.read", async () => ok(await listDevicesView()));

export const POST = staffRoute("map.write", async ({ request, staff, i18n }) => {
  const input = parseWith(deviceInputSchema, await readJson(request));
  return created(await createDevice(input, staff.user.id), i18n.t("api.created"));
});
