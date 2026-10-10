import { staffRoute } from "@/server/route";
import { deleteSignIn, updateSignIn } from "@/modules/signins/service";
import { signInUpdateSchema } from "@/modules/signins/validation";
import { parseId, readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

export const PATCH = staffRoute<{ id: string }>("map.write", async ({ request, params, staff, i18n }) => {
  const input = parseWith(signInUpdateSchema, await readJson(request));
  return ok(await updateSignIn(parseId(params.id), input, staff.user.id), i18n.t("api.updated"));
});

/** Removes a sign-in recorded by mistake; signing out keeps it as history instead. */
export const DELETE = staffRoute<{ id: string }>("map.write", async ({ params, staff, i18n }) =>
  ok(await deleteSignIn(parseId(params.id), staff.user.id), i18n.t("api.deleted")),
);
