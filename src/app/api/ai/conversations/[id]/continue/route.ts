import { staffRoute } from "@/server/route";
import { prepareContinue } from "@/server/agent/runner";
import { agentSession, agentStream } from "@/server/agent/stream";
import { parseId } from "@/shared/http/request";

export const maxDuration = 60;

/** Lets the assistant go on after it stopped at its step or time limit, or after a provider error. */
export const POST = staffRoute<{ id: string }>(null, async ({ params, staff, i18n }) => {
  const session = await agentSession(staff, i18n);
  return agentStream(await prepareContinue(session, parseId(params.id)), i18n.t);
});
