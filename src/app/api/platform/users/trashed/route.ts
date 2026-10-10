import { listParams } from "@/server/query";
import { platformRoute } from "@/server/route";
import { listStaff } from "@/modules/users/service";
import { paginated } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

export const GET = platformRoute(async ({ url }) => {
  const query = listParams(url);
  const { items, total } = await listStaff({ ...query, trashed: true });
  return ok(paginated(items, total, query));
});
