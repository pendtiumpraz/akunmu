import { staffRoute } from "@/server/route";
import { toolsFor } from "@/server/agent/tools";
import { conversationView, listConversations } from "@/modules/ai/conversations";
import { aiUsageSummary, availableModels } from "@/modules/ai/gateway";
import { can } from "@/modules/users/permissions";
import { ok } from "@/shared/http/respond";

/** What the chat screen needs to start: the person's chats, models, this month's usage and allowed tools. */
export const GET = staffRoute(null, async ({ staff }) => {
  const [conversations, models, usage] = await Promise.all([listConversations(staff.user.id), availableModels(), aiUsageSummary()]);
  return ok(
    {
      conversations: conversations.map(conversationView),
      models,
      usage: { requests: usage.requests, limit: usage.limit, source: usage.source },
      tools: toolsFor(staff.user.role).map((tool) => tool.name),
      canConfigure: can(staff.user.role, "settings.manage"),
    },
    "",
    200,
    { "Cache-Control": "no-store" },
  );
});
