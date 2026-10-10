import { idParam, listParams } from "@/server/query";
import { staffRoute } from "@/server/route";
import { accountDetail, createAccount, listAccountsView } from "@/modules/accounts/service";
import { accountInputSchema } from "@/modules/accounts/validation";
import { paginated, readJson } from "@/shared/http/request";
import { created, ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

/** Accounts with how many places each is signed in; ?search, ?provider=<id>, ?page, ?per_page. */
export const GET = staffRoute("map.read", async ({ url }) => {
  const query = { ...listParams(url), providerId: idParam(url, "provider") };
  const { items, total } = await listAccountsView(query);
  return ok(paginated(items, total, query));
});

export const POST = staffRoute("map.write", async ({ request, staff, i18n }) => {
  const input = parseWith(accountInputSchema, await readJson(request));
  const account = await createAccount(input, staff.user.id);
  return created(await accountDetail(account.id), i18n.t("api.created"));
});
