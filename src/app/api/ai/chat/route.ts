import { z } from "zod";
import { staffRoute } from "@/server/route";
import { prepareQuestion } from "@/server/agent/runner";
import { agentSession, agentStream } from "@/server/agent/stream";
import { readJson } from "@/shared/http/request";
import { parseWith } from "@/shared/http/validation";

export const maxDuration = 60;

const schema = z.object({
  conversationId: z.number().int().min(1).nullish(),
  text: z.string().max(8000),
  model: z.string().trim().max(200).nullish(),
});

/** Asks the assistant (a new chat without conversationId); the answer streams as server-sent events. */
export const POST = staffRoute(null, async ({ request, staff, i18n }) => {
  const input = parseWith(schema, await readJson(request));
  const session = await agentSession(staff, i18n);
  const run = await prepareQuestion(session, { conversationId: input.conversationId ?? null, text: input.text, model: input.model });
  return agentStream(run, i18n.t);
});
