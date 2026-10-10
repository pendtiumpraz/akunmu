import { z } from "zod";
import { staffRoute } from "@/server/route";
import { prepareConfirmation } from "@/server/agent/runner";
import { agentSession, agentStream } from "@/server/agent/stream";
import { parseId, readJson } from "@/shared/http/request";
import { parseWith } from "@/shared/http/validation";

export const maxDuration = 60;

/** Secrets (such as the SMTP password) come from the confirmation card and never pass through the AI provider. */
const schema = z.object({ secrets: z.record(z.string(), z.string().max(500)).default({}) });

/** Runs a change the assistant proposed; the assistant's follow-up streams as server-sent events. */
export const POST = staffRoute<{ id: string }>(null, async ({ request, params, staff, i18n }) => {
  const input = parseWith(schema, await readJson(request));
  const session = await agentSession(staff, i18n);
  return agentStream(await prepareConfirmation(session, parseId(params.id), input.secrets), i18n.t);
});
