import { staffRoute } from "@/server/route";
import { deleteStaff, getStaff, updateStaff } from "@/modules/users/service";
import { updateUserSchema } from "@/modules/users/validation";
import { parseId, readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

export const GET = staffRoute<{ id: string }>("users.manage", async ({ params }) => ok(await getStaff(parseId(params.id))));

export const PATCH = staffRoute<{ id: string }>("users.manage", async ({ request, params, staff, i18n }) => {
  const input = parseWith(updateUserSchema, await readJson(request));
  return ok(await updateStaff(parseId(params.id), input, staff.user.id), i18n.t("api.updated"));
});

export const DELETE = staffRoute<{ id: string }>("users.manage", async ({ params, staff, i18n }) =>
  ok(await deleteStaff(parseId(params.id), staff.user.id), i18n.t("api.deleted")),
);
