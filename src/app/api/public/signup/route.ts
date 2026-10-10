import { publicRoute } from "@/server/route";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { signUpTenant } from "@/modules/tenants/service";
import { signupSchema } from "@/modules/tenants/validation";
import { authenticateStaff } from "@/modules/users/service";
import { startStaffSession } from "@/modules/users/session";
import { clientIp, readJson } from "@/shared/http/request";
import { created } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

const SIGNUPS_PER_IP_PER_HOUR = 5;

/** Self-service sign-up: a new workspace (trial) and its first admin, signed in right away. */
export const POST = publicRoute(async ({ request, i18n }) => {
  await enforceRateLimit(`signup-ip:${clientIp(request)}`, SIGNUPS_PER_IP_PER_HOUR, 3600);
  const input = parseWith(signupSchema, await readJson(request));
  const { tenant } = await signUpTenant(input);
  const user = await authenticateStaff(input.email, input.password);
  await startStaffSession(user, request.headers.get("user-agent"));
  return created({ tenant: { slug: tenant.slug, name: tenant.name }, redirectTo: "/app" }, i18n.t("api.signedUp"));
});
