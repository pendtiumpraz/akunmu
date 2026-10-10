import { staffRoute } from "@/server/route";
import { deleteProvider, updateProvider } from "@/modules/accounts/service";
import { providerUpdateSchema } from "@/modules/accounts/validation";
import { parseId, readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

export const PATCH = staffRoute<{ id: string }>("map.write", async ({ request, params, staff, i18n }) => {
  const input = parseWith(providerUpdateSchema, await readJson(request));
  return ok(await updateProvider(parseId(params.id), input, staff.user.id), i18n.t("api.updated"));
});

/** Only providers without accounts can be removed. */
export const DELETE = staffRoute<{ id: string }>("map.write", async ({ params, staff, i18n }) =>
  ok(await deleteProvider(parseId(params.id), staff.user.id), i18n.t("api.deleted")),
);
