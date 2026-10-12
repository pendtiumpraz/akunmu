import { staffRoute } from "@/server/route";
import { exportMyData } from "@/modules/privacy/my-data";
import { enforceRateLimit } from "@/modules/security/rate-limit";

const EXPORTS_PER_HOUR = 10;

/**
 * A copy of the signed-in user's data as a JSON file (UU PDP Art. 7 and 13): account, sessions, consent,
 * requests, assistant chats and the workspace map they can read.
 */
export const GET = staffRoute(null, async ({ staff }) => {
  await enforceRateLimit(`my-data:${staff.user.id}`, EXPORTS_PER_HOUR, 3600);
  const data = await exportMyData(staff.user, staff.tenantId);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="akunmu-my-data-${day}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
});
