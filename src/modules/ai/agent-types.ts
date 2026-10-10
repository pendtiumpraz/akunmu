/** Assistant (AI agent) types shared by the server and the chat screen (no database imports). */
import type { AiToolCall } from "./types";

export const AGENT_MESSAGE_ROLES = ["user", "assistant"] as const;
export type AgentMessageRole = (typeof AGENT_MESSAGE_ROLES)[number];

/** pending → running → done | failed, or pending → declined. */
export const AGENT_ACTION_STATUSES = ["pending", "running", "done", "failed", "declined"] as const;
export type AgentActionStatus = (typeof AGENT_ACTION_STATUSES)[number];

/** Outcome of one tool call: `data` is what the model reads (as JSON) and what the chat screen renders. */
export type StoredToolResult = { callId: string; name: string; ok: boolean; data?: unknown; error?: string };

export type AgentPreviewField = { label: string; value: string; before?: string };

/** What the confirmation card shows, already in the person's language. */
export type AgentActionPreview = {
  title: string;
  fields: AgentPreviewField[];
  note?: string;
  /** A secret typed into the card, never into the chat (it must not reach the AI provider). */
  secret?: { key: string; label: string; hint: string; required: boolean };
};

export type AgentActionView = {
  id: number;
  callId: string;
  tool: string;
  status: AgentActionStatus;
  preview: AgentActionPreview;
  result: StoredToolResult | null;
  decidedAt: string | null;
};

export type AgentMessageView = {
  id: number;
  role: AgentMessageRole;
  content: string;
  createdAt: string;
  toolCalls: AiToolCall[];
  results: StoredToolResult[];
  actions: AgentActionView[];
};

export type AgentConversationView = { id: number; title: string; model: string | null; lastMessageAt: string; running: boolean };

/** How a run of the assistant ended. */
export type AgentRunState = "complete" | "awaiting_confirmation" | "interrupted";

/** Events of the chat endpoints' server-sent event stream. */
export type AgentStreamEvent =
  | { type: "conversation"; conversation: AgentConversationView }
  | { type: "message"; message: AgentMessageView }
  | { type: "status"; state: "thinking" | "tool"; tool?: string }
  | { type: "done"; state: AgentRunState; usage: { requests: number; limit: number | null } }
  | { type: "error"; message: string; status: number };

/** What the composer can mention: a device or an account, written as @[Name](device:12) or @[x@gmail.com](account:5). */
export const MENTION_KINDS = ["device", "account"] as const;
export type MentionKind = (typeof MENTION_KINDS)[number];

export const MENTION_PATTERN = /@\[([^\]\n]{1,160})\]\((device|account):(\d{1,12})\)/g;

export function mentionToken(title: string, kind: MentionKind, id: number): string {
  return `@[${title.replace(/[[\]\n]/g, " ").trim().slice(0, 160)}](${kind}:${id})`;
}

/** The text with mentions shown as "@Name" (conversation titles, previews). */
export function plainMentions(text: string): string {
  return text.replace(MENTION_PATTERN, (_match, title: string) => `@${title}`);
}
