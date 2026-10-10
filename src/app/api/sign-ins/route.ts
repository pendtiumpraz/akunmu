import { staffRoute } from "@/server/route";
import { recordSignIn } from "@/modules/signins/service";
import { signInInputSchema } from "@/modules/signins/validation";
import { readJson } from "@/shared/http/request";
import { created } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

/** Records an account as signed in at a place; the account is added when given by provider and identifier. */
export const POST = staffRoute("map.write", async ({ request, staff, i18n }) => {
  const input = parseWith(signInInputSchema, await readJson(request));
  return created(await recordSignIn(input, staff.user.id), i18n.t("signIns.recordedMessage"));
});
