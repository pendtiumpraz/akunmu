import { staffRoute } from "@/server/route";
import { fileUserRequest, requestsOfUser, userRequestSchema } from "@/modules/privacy/requests";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { readJson } from "@/shared/http/request";
import { created, ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

const REQUESTS_PER_DAY = 10;

/** The signed-in user's own data subject requests, to the workspace or to the AkunMu operator. */
export const GET = staffRoute(null, async ({ staff }) => {
  const rows = await requestsOfUser(staff.user.id, staff.tenantId);
  return ok(
    rows.map(({ id, code, tenantId, requestType, status, description, response, deadlineAt, respondedAt, closedAt, createdAt }) => ({
      id,
      code,
      recipient: tenantId === null ? "platform" : "workspace",
      requestType,
      status,
      description,
      response,
      deadlineAt,
      respondedAt,
      closedAt,
      createdAt,
    })),
    "",
    200,
    { "Cache-Control": "no-store" },
  );
});

/** Files a request (UU PDP Art. 5–14); it must be answered within 3 x 24 hours. */
export const POST = staffRoute(null, async ({ request, staff, i18n }) => {
  await enforceRateLimit(`privacy-request:${staff.user.id}`, REQUESTS_PER_DAY, 86_400);
  const input = parseWith(userRequestSchema, await readJson(request));
  const row = await fileUserRequest(staff.user, staff.tenantId, input);
  return created({ id: row.id, code: row.code, deadlineAt: row.deadlineAt }, i18n.t("api.requestFiled"));
});
