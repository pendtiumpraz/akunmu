import { staffRoute } from "@/server/route";
import { signOut } from "@/modules/signins/service";
import { parseId } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

export const POST = staffRoute<{ id: string }>("map.write", async ({ params, staff, i18n }) =>
  ok(await signOut(parseId(params.id), staff.user.id), i18n.t("signIns.signedOutMessage")),
);
