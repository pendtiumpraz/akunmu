import { platformRoute } from "@/server/route";
import { deleteStaff, getPlatformStaff, updateStaff } from "@/modules/users/service";
import { updateUserSchema } from "@/modules/users/validation";
import { parseId, readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

export const GET = platformRoute<{ id: string }>(async ({ params }) => ok(await getPlatformStaff(parseId(params.id))));

export const PATCH = platformRoute<{ id: string }>(async ({ request, params, staff, i18n }) => {
  await getPlatformStaff(parseId(params.id));
  const input = parseWith(updateUserSchema, await readJson(request));
  return ok(await updateStaff(parseId(params.id), input, staff.user.id), i18n.t("api.updated"));
});

export const DELETE = platformRoute<{ id: string }>(async ({ params, staff, i18n }) => {
  await getPlatformStaff(parseId(params.id));
  return ok(await deleteStaff(parseId(params.id), staff.user.id), i18n.t("api.deleted"));
});
