import { listParams } from "@/server/query";
import { platformRoute } from "@/server/route";
import { createStaff, listStaff } from "@/modules/users/service";
import { createUserSchema } from "@/modules/users/validation";
import { paginated, readJson } from "@/shared/http/request";
import { created, ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

/** Platform staff (AkunMu owner and support): accounts without a tenant. */
export const GET = platformRoute(async ({ url }) => {
  const query = listParams(url);
  const { items, total } = await listStaff(query);
  return ok(paginated(items, total, query));
});

export const POST = platformRoute(async ({ request, staff, i18n }) => {
  const input = parseWith(createUserSchema, await readJson(request));
  return created(await createStaff(input, staff.user.id), i18n.t("api.created"));
});
