import { staffRoute } from "@/server/route";
import { accountDetail, restoreAccount } from "@/modules/accounts/service";
import { parseId } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

export const PATCH = staffRoute<{ id: string }>("map.write", async ({ params, staff, i18n }) => {
  const id = parseId(params.id);
  await restoreAccount(id, staff.user.id);
  return ok(await accountDetail(id), i18n.t("api.restored"));
});
