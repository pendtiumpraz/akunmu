import { z } from "zod";
import { staffRoute } from "@/server/route";
import { consentState, updateConsent } from "@/modules/privacy/consents";
import { readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

const consentInputSchema = z.object({ marketing: z.boolean() });

/** The user's consent: the policy version they accepted, product news, and the history (PP 33/2026 Art. 36). */
export const GET = staffRoute(null, async ({ staff }) => ok(await consentState(staff.user.id), "", 200, { "Cache-Control": "no-store" }));

/** Accepts the current policy, and sets or withdraws product news (withdrawal is as easy as giving it). */
export const PUT = staffRoute(null, async ({ request, staff, i18n }) => {
  const input = parseWith(consentInputSchema, await readJson(request));
  return ok(await updateConsent(staff.user.id, staff.tenantId, input.marketing), i18n.t("api.updated"));
});
