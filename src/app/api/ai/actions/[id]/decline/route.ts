import { staffRoute } from "@/server/route";
import { declineAction } from "@/server/agent/runner";
import { agentSession } from "@/server/agent/stream";
import { parseId } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

export const POST = staffRoute<{ id: string }>(null, async ({ params, staff, i18n }) => {
  const session = await agentSession(staff, i18n);
  return ok(await declineAction(session, parseId(params.id)));
});
