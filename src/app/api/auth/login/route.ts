import { publicRoute } from "@/server/route";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { authenticateStaff, toPublicUser } from "@/modules/users/service";
import { startStaffSession } from "@/modules/users/session";
import { loginSchema } from "@/modules/users/validation";
import { clientIp, readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 15 * 60;

export const POST = publicRoute(async ({ request, i18n }) => {
  const input = parseWith(loginSchema, await readJson(request));
  await enforceRateLimit(`login:${input.email}`, MAX_ATTEMPTS, WINDOW_SECONDS);
  await enforceRateLimit(`login-ip:${clientIp(request)}`, MAX_ATTEMPTS * 3, WINDOW_SECONDS);
  const user = await authenticateStaff(input.email, input.password);
  await startStaffSession(user, request.headers.get("user-agent"));
  return ok(toPublicUser(user), i18n.t("api.loggedIn"));
});
