import { staffRoute } from "@/server/route";
import { confirmSignIn } from "@/modules/signins/service";
import { parseId } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

/** Someone looked: the account is still signed in there. */
export const POST = staffRoute<{ id: string }>("map.write", async ({ params, staff, i18n }) =>
  ok(await confirmSignIn(parseId(params.id), staff.user.id), i18n.t("signIns.confirmedMessage")),
);
