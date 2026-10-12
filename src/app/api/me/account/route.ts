import { z } from "zod";
import { staffRoute } from "@/server/route";
import { deleteMyAccount } from "@/modules/privacy/my-data";
import { endStaffSession } from "@/modules/users/session";
import { readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

const confirmationSchema = z.object({ confirmation: z.string().trim().min(1).max(200) });

/** Erases the signed-in user's account (UU PDP Art. 8) after they typed their email, then signs them out. */
export const DELETE = staffRoute(null, async ({ request, staff, i18n }) => {
  const { confirmation } = parseWith(confirmationSchema, await readJson(request));
  await deleteMyAccount(staff.user, staff.tenantId, confirmation);
  await endStaffSession();
  return ok({ redirectTo: "/" }, i18n.t("api.accountDeleted"));
});
