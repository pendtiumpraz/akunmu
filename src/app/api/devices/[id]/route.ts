import { staffRoute } from "@/server/route";
import { deleteDevice, deviceDetail, updateDevice } from "@/modules/devices/service";
import { deviceUpdateSchema } from "@/modules/devices/validation";
import { parseId, readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

export const GET = staffRoute<{ id: string }>("map.read", async ({ params }) => ok(await deviceDetail(parseId(params.id))));

export const PATCH = staffRoute<{ id: string }>("map.write", async ({ request, params, staff, i18n }) => {
  const input = parseWith(deviceUpdateSchema, await readJson(request));
  return ok(await updateDevice(parseId(params.id), input, staff.user.id), i18n.t("api.updated"));
});

/** Moves the device to the trash with its browser profiles and sign-ins. */
export const DELETE = staffRoute<{ id: string }>("map.write", async ({ params, staff, i18n }) =>
  ok(await deleteDevice(parseId(params.id), staff.user.id), i18n.t("api.deleted")),
);
