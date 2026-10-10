import { staffRoute } from "@/server/route";
import { deleteProfile, updateProfile } from "@/modules/devices/service";
import { profileUpdateSchema } from "@/modules/devices/validation";
import { parseId, readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

export const PATCH = staffRoute<{ id: string }>("map.write", async ({ request, params, staff, i18n }) => {
  const input = parseWith(profileUpdateSchema, await readJson(request));
  return ok(await updateProfile(parseId(params.id), input, staff.user.id), i18n.t("api.updated"));
});

/** Removes the browser profile and the sign-ins recorded in it. */
export const DELETE = staffRoute<{ id: string }>("map.write", async ({ params, staff, i18n }) =>
  ok(await deleteProfile(parseId(params.id), staff.user.id), i18n.t("api.deleted")),
);
