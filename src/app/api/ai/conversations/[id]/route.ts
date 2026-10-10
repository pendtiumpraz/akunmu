import { z } from "zod";
import { staffRoute } from "@/server/route";
import { conversationDetail } from "@/server/agent/runner";
import { conversationView, softDeleteConversation, updateConversation } from "@/modules/ai/conversations";
import { notFound } from "@/shared/http/errors";
import { parseId, readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

const renameSchema = z.object({ title: z.string().trim().min(1).max(80) });

export const GET = staffRoute<{ id: string }>(null, async ({ params, staff }) =>
  ok(await conversationDetail(staff.user.id, parseId(params.id)), "", 200, { "Cache-Control": "no-store" }),
);

export const PATCH = staffRoute<{ id: string }>(null, async ({ request, params, staff, i18n }) => {
  const input = parseWith(renameSchema, await readJson(request));
  const updated = await updateConversation(parseId(params.id), staff.user.id, { title: input.title });
  if (!updated) throw notFound();
  return ok(conversationView(updated), i18n.t("api.updated"));
});

export const DELETE = staffRoute<{ id: string }>(null, async ({ params, staff, i18n }) => {
  if (!(await softDeleteConversation(parseId(params.id), staff.user.id))) throw notFound();
  return ok(null, i18n.t("ai.chatDeleted"));
});
