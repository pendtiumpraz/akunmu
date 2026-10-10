import { platformRoute } from "@/server/route";
import { deleteTenant, getTenant, updateTenant } from "@/modules/tenants/service";
import { tenantUpdateSchema } from "@/modules/tenants/validation";
import { parseId, readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

export const GET = platformRoute<{ id: string }>(async ({ params }) => ok(await getTenant(parseId(params.id))));

export const PATCH = platformRoute<{ id: string }>(async ({ request, params, staff, i18n }) => {
  const input = parseWith(tenantUpdateSchema, await readJson(request));
  return ok(await updateTenant(parseId(params.id), input, staff.user.id), i18n.t("api.updated"));
});

export const DELETE = platformRoute<{ id: string }>(async ({ params, staff, i18n }) =>
  ok(await deleteTenant(parseId(params.id), staff.user.id), i18n.t("api.deleted")),
);
