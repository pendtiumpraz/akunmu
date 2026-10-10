import { and, asc, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "../../shared/db";
import type { AgentActionStatus, AgentActionView, AgentConversationView, AgentMessageView, StoredToolResult } from "./agent-types";
import { aiActions, aiConversations, aiMessages, type AiActionRecord, type AiConversationRecord, type AiMessageRecord } from "./schema";

/** A run that has held a chat this long is treated as dead (the serverless function was stopped). */
const RUN_LOCK_MS = 2 * 60_000;

/** Chats of one staff member, newest first. Row level security already limits them to the tenant. */
export async function listConversations(userId: number, limit = 50): Promise<AiConversationRecord[]> {
  return db()
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.userId, userId), isNull(aiConversations.deletedAt)))
    .orderBy(desc(aiConversations.lastMessageAt))
    .limit(limit);
}

export async function findConversation(id: number, userId: number): Promise<AiConversationRecord | undefined> {
  const [row] = await db()
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId), isNull(aiConversations.deletedAt)))
    .limit(1);
  return row;
}

export async function insertConversation(values: { userId: number; title: string; model: string | null }): Promise<AiConversationRecord> {
  const [row] = await db().insert(aiConversations).values(values).returning();
  return row;
}

export async function updateConversation(id: number, userId: number, changes: { title?: string; model?: string | null; lastMessageAt?: Date }) {
  const [row] = await db()
    .update(aiConversations)
    .set(changes)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId), isNull(aiConversations.deletedAt)))
    .returning();
  return row;
}

export async function softDeleteConversation(id: number, userId: number) {
  const [row] = await db()
    .update(aiConversations)
    .set({ deletedAt: new Date() })
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId), isNull(aiConversations.deletedAt)))
    .returning();
  return row;
}

/** Takes the chat's run lock in one statement; null when another run holds it. */
export async function lockConversation(id: number, userId: number): Promise<AiConversationRecord | null> {
  const staleBefore = new Date(Date.now() - RUN_LOCK_MS);
  const [row] = await db()
    .update(aiConversations)
    .set({ runningSince: new Date() })
    .where(
      and(
        eq(aiConversations.id, id),
        eq(aiConversations.userId, userId),
        isNull(aiConversations.deletedAt),
        or(isNull(aiConversations.runningSince), lt(aiConversations.runningSince, staleBefore)),
      ),
    )
    .returning();
  return row ?? null;
}

export async function unlockConversation(id: number): Promise<void> {
  await db().update(aiConversations).set({ runningSince: null, lastMessageAt: new Date() }).where(eq(aiConversations.id, id));
}

export async function insertMessage(values: typeof aiMessages.$inferInsert): Promise<AiMessageRecord> {
  const [row] = await db().insert(aiMessages).values(values).returning();
  return row;
}

export async function findMessage(id: number, conversationId: number): Promise<AiMessageRecord | undefined> {
  const [row] = await db()
    .select()
    .from(aiMessages)
    .where(and(eq(aiMessages.id, id), eq(aiMessages.conversationId, conversationId), isNull(aiMessages.deletedAt)))
    .limit(1);
  return row;
}

export async function setMessageResults(id: number, results: StoredToolResult[]): Promise<AiMessageRecord> {
  const [row] = await db().update(aiMessages).set({ results }).where(eq(aiMessages.id, id)).returning();
  return row;
}

/** The chat's latest messages in order (the model only needs a recent window). */
export async function recentMessages(conversationId: number, limit: number): Promise<AiMessageRecord[]> {
  const rows = await db()
    .select()
    .from(aiMessages)
    .where(and(eq(aiMessages.conversationId, conversationId), isNull(aiMessages.deletedAt)))
    .orderBy(desc(aiMessages.id))
    .limit(limit);
  return rows.reverse();
}

export async function actionsOfMessages(messageIds: number[]): Promise<AiActionRecord[]> {
  if (messageIds.length === 0) return [];
  return db().select().from(aiActions).where(inArray(aiActions.messageId, messageIds)).orderBy(asc(aiActions.id));
}

export async function insertAction(values: typeof aiActions.$inferInsert): Promise<AiActionRecord> {
  const [row] = await db().insert(aiActions).values(values).returning();
  return row;
}

export async function findAction(id: number): Promise<AiActionRecord | undefined> {
  const [row] = await db().select().from(aiActions).where(eq(aiActions.id, id)).limit(1);
  return row;
}

/** Moves a pending action on in one statement, so a double click cannot run it twice; null when it was not pending. */
export async function decideAction(id: number, status: Extract<AgentActionStatus, "running" | "declined">, userId: number, result?: StoredToolResult) {
  const [row] = await db()
    .update(aiActions)
    .set({ status, decidedBy: userId, decidedAt: new Date(), ...(result ? { result } : {}) })
    .where(and(eq(aiActions.id, id), eq(aiActions.status, "pending")))
    .returning();
  return row ?? null;
}

export async function finishAction(id: number, status: Extract<AgentActionStatus, "done" | "failed">, result: StoredToolResult): Promise<AiActionRecord> {
  const [row] = await db().update(aiActions).set({ status, result }).where(eq(aiActions.id, id)).returning();
  return row;
}

/** Actions of a chat still waiting for a decision or running. */
export async function openActions(conversationId: number): Promise<AiActionRecord[]> {
  return db()
    .select()
    .from(aiActions)
    .where(and(eq(aiActions.conversationId, conversationId), inArray(aiActions.status, ["pending", "running"])))
    .orderBy(asc(aiActions.id));
}

/** A new question replaces the open proposals: they are declined so the model sees an answer for every call. */
export async function declinePendingActions(conversationId: number, userId: number, result: (action: AiActionRecord) => StoredToolResult) {
  const pending = await db()
    .select()
    .from(aiActions)
    .where(and(eq(aiActions.conversationId, conversationId), eq(aiActions.status, "pending")));
  for (const action of pending) await decideAction(action.id, "declined", userId, result(action));
}

// ----- views for the chat screen -----

export function actionView(action: AiActionRecord): AgentActionView {
  return {
    id: action.id,
    callId: action.callId,
    tool: action.tool,
    status: action.status,
    preview: action.preview,
    result: action.result ?? null,
    decidedAt: action.decidedAt ? action.decidedAt.toISOString() : null,
  };
}

export function messageView(message: AiMessageRecord, actions: AiActionRecord[]): AgentMessageView {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    toolCalls: message.toolCalls,
    results: message.results,
    actions: actions.filter((action) => action.messageId === message.id).map(actionView),
  };
}

export function conversationView(conversation: AiConversationRecord): AgentConversationView {
  const running = conversation.runningSince !== null && Date.now() - conversation.runningSince.getTime() < RUN_LOCK_MS;
  return { id: conversation.id, title: conversation.title, model: conversation.model, lastMessageAt: conversation.lastMessageAt.toISOString(), running };
}
