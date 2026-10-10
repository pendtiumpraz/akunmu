import { listParams } from "@/server/query";
import { platformRoute } from "@/server/route";
import { listTenantsForPlatform } from "@/modules/tenants/service";
import { paginated } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

export const GET = platformRoute(async ({ url }) => {
  const params = listParams(url);
  const { items, total } = await listTenantsForPlatform({ ...params, trashed: true });
  return ok(paginated(items, total, params));
});
