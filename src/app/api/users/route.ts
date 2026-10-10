import { listParams } from "@/server/query";
import { staffRoute } from "@/server/route";
import { createStaff, listStaff } from "@/modules/users/service";
import { createUserSchema } from "@/modules/users/validation";
import { paginated, readJson } from "@/shared/http/request";
import { created, ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

export const GET = staffRoute("users.manage", async ({ url }) => {
  const query = listParams(url);
  const { items, total } = await listStaff(query);
  return ok(paginated(items, total, query));
});

export const POST = staffRoute("users.manage", async ({ request, staff, i18n }) => {
  const input = parseWith(createUserSchema, await readJson(request));
  return created(await createStaff(input, staff.user.id), i18n.t("api.created"));
});
