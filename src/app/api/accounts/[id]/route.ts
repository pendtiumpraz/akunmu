import { staffRoute } from "@/server/route";
import { accountDetail, deleteAccount, updateAccount } from "@/modules/accounts/service";
import { accountUpdateSchema } from "@/modules/accounts/validation";
import { parseId, readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

/** An account with every place it is signed in, and where it was signed out. */
export const GET = staffRoute<{ id: string }>("map.read", async ({ params }) => ok(await accountDetail(parseId(params.id))));

export const PATCH = staffRoute<{ id: string }>("map.write", async ({ request, params, staff, i18n }) => {
  const id = parseId(params.id);
  const input = parseWith(accountUpdateSchema, await readJson(request));
  await updateAccount(id, input, staff.user.id);
  return ok(await accountDetail(id), i18n.t("api.updated"));
});

/** Moves the account to the trash with its sign-ins. */
export const DELETE = staffRoute<{ id: string }>("map.write", async ({ params, staff, i18n }) =>
  ok(await deleteAccount(parseId(params.id), staff.user.id), i18n.t("api.deleted")),
);
