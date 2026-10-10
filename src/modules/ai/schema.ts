import { index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { baseColumns, referenceColumn, tenantColumn } from "../../shared/db/columns";
import type { AgentActionPreview, AgentActionStatus, AgentMessageRole, StoredToolResult } from "./agent-types";
import type { AiProviderState, AiToolCall } from "./types";

/** AI messages and tokens per tenant per calendar month (Asia/Jakarta), counted against the plan's quota. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    ...baseColumns(),
    tenantId: tenantColumn(),
    /** "YYYY-MM". */
    period: text("period").notNull(),
    requests: integer("requests").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
  },
  (table) => [unique("ai_usage_tenant_period_unique").on(table.tenantId, table.period)],
);

export type AiUsageRecord = typeof aiUsage.$inferSelect;

/** One assistant chat of one staff member; nobody else in the workspace sees it. */
export const aiConversations = pgTable(
  "ai_conversations",
  {
    ...baseColumns(),
    tenantId: tenantColumn(),
    userId: referenceColumn("user_id").notNull(),
    title: text("title").notNull().default(""),
    /** Model chosen for this chat; null uses the default. */
    model: text("model"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set while the assistant works on the chat, so two runs never interleave; an old value means a run died. */
    runningSince: timestamp("running_since", { withTimezone: true }),
  },
  (table) => [index("ai_conversations_user_index").on(table.tenantId, table.userId, table.lastMessageAt)],
);

/**
 * A chat message. Assistant messages keep the tools they called and the results of the tools that ran right
 * away; results of changes that wait for the person's confirmation live in ai_actions.
 */
export const aiMessages = pgTable(
  "ai_messages",
  {
    ...baseColumns(),
    tenantId: tenantColumn(),
    conversationId: referenceColumn("conversation_id").notNull(),
    role: text("role").$type<AgentMessageRole>().notNull(),
    content: text("content").notNull().default(""),
    toolCalls: jsonb("tool_calls").$type<AiToolCall[]>().notNull().default([]),
    results: jsonb("results").$type<StoredToolResult[]>().notNull().default([]),
    model: text("model"),
    /** The provider's reasoning (Claude thinking blocks, DeepSeek reasoning) that goes back during the tool loop. */
    providerState: jsonb("provider_state").$type<AiProviderState>(),
  },
  (table) => [index("ai_messages_conversation_index").on(table.conversationId, table.id)],
);

/** A change the assistant proposed; it runs only when the person confirms it on screen. */
export const aiActions = pgTable(
  "ai_actions",
  {
    ...baseColumns(),
    tenantId: tenantColumn(),
    conversationId: referenceColumn("conversation_id").notNull(),
    /** The assistant message whose tool call proposed it. */
    messageId: referenceColumn("message_id").notNull(),
    callId: text("call_id").notNull(),
    tool: text("tool").notNull(),
    /** Validated tool input; never holds secrets (those are typed into the confirmation card). */
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    preview: jsonb("preview").$type<AgentActionPreview>().notNull(),
    status: text("status").$type<AgentActionStatus>().notNull().default("pending"),
    result: jsonb("result").$type<StoredToolResult>(),
    decidedBy: referenceColumn("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [index("ai_actions_conversation_index").on(table.conversationId), index("ai_actions_message_index").on(table.messageId)],
);

export type AiConversationRecord = typeof aiConversations.$inferSelect;
export type AiMessageRecord = typeof aiMessages.$inferSelect;
export type AiActionRecord = typeof aiActions.$inferSelect;
