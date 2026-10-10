import { enumParam, listParams } from "@/server/query";
import { platformRoute } from "@/server/route";
import { createTenantFromPlatform, listTenantsForPlatform } from "@/modules/tenants/service";
import { TENANT_STATUSES } from "@/modules/tenants/types";
import { platformTenantInputSchema } from "@/modules/tenants/validation";
import { paginated, readJson } from "@/shared/http/request";
import { created, ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

export const GET = platformRoute(async ({ url }) => {
  const params = listParams(url);
  const { items, total } = await listTenantsForPlatform({ ...params, status: enumParam(url, "status", TENANT_STATUSES) });
  return ok(paginated(items, total, params));
});

/** Creates a tenant; with an admin email the response carries the temporary password of that admin once. */
export const POST = platformRoute(async ({ request, staff, i18n }) => {
  const input = parseWith(platformTenantInputSchema, await readJson(request));
  return created(await createTenantFromPlatform(input, staff.user.id), i18n.t("api.created"));
});
