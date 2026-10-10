import { listParams } from "@/server/query";
import { staffRoute } from "@/server/route";
import { listAccountsView } from "@/modules/accounts/service";
import { paginated } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

export const GET = staffRoute("map.read", async ({ url }) => {
  const query = listParams(url);
  const { items, total } = await listAccountsView({ ...query, trashed: true });
  return ok(paginated(items, total, query));
});
