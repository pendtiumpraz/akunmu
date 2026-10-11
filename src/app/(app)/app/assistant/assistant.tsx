"use client";

import { History, MessageSquarePlus, Pencil, Play, Settings2, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AgentActionView, AgentConversationView, AgentMessageView, AgentStreamEvent } from "@/modules/ai/agent-types";
import { api, ApiClientError } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Alert, Skeleton } from "@/shared/ui/feedback";
import { buttonClasses } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { useApi } from "@/shared/ui/use-api";
import { useToast } from "@/shared/ui/toast";
import { useStaff } from "../app-shell";
import { ASSISTANT_STARTERS } from "./commands";
import { Composer } from "./composer";
import { AssistantAvatar, AssistantMessage, ThinkingRow, UserBubble } from "./parts";
import { streamAgent } from "./stream";

type Usage = { requests: number; limit: number | null; source?: string };
type Context = { conversations: AgentConversationView[]; models: { model: string; provider: string }[]; usage: Usage; tools: string[]; canConfigure: boolean };
type Status = { state: "idle" | "thinking" | "tool"; tool?: string };
type Notice = { kind: "interrupted" } | { kind: "error"; message: string; canContinue: boolean };

function withMessage(list: AgentMessageView[], message: AgentMessageView): AgentMessageView[] {
  // The stored question replaces the optimistic one (negative id) the screen showed while sending.
  const base = message.role === "user" ? list.filter((item) => item.id > 0) : list;
  const index = base.findIndex((item) => item.id === message.id);
  if (index === -1) return [...base, message];
  const next = [...base];
  next[index] = message;
  return next;
}

function setUrl(conversationId: number | null) {
  const url = new URL(window.location.href);
  if (conversationId) url.searchParams.set("c", String(conversationId));
  else url.searchParams.delete("c");
  window.history.replaceState(null, "", url);
}

/** The assistant: chats on the left, the conversation with tool steps and confirmation cards on the right. */
export function Assistant({ initialConversationId, initialQuestion }: { initialConversationId: number | null; initialQuestion: string }) {
  const { t, format } = useI18n();
  const notify = useToast();
  const { user } = useStaff();
  const context = useApi<Context>("/api/ai/assistant");
  const [activeId, setActiveId] = useState<number | null>(initialConversationId);
  const [messages, setMessages] = useState<AgentMessageView[]>([]);
  const [loadingChat, setLoadingChat] = useState(initialConversationId !== null);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renaming, setRenaming] = useState<{ id: number; title: string } | null>(null);
  const [deleting, setDeleting] = useState<AgentConversationView | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const startedHere = useRef<number | null>(null);
  /** Negative ids of questions shown before the server stored them. */
  const localIds = useRef(0);
  /** Follow new messages while the person is at the bottom (or has just asked something). */
  const pinned = useRef(true);

  const conversations = context.data?.conversations ?? [];
  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const currentUsage = usage ?? context.data?.usage ?? null;
  const tools = context.data?.tools ?? [];
  const models = context.data?.models ?? [];
  const configured = models.length > 0;

  // Load the chat chosen from the list (or from ?c= on first render); a chat started here is already on screen.
  useEffect(() => {
    if (activeId === null || startedHere.current === activeId) return;
    let cancelled = false;
    api<{ conversation: AgentConversationView; messages: AgentMessageView[] }>(`/api/ai/conversations/${activeId}`)
      .then(({ data }) => {
        if (cancelled) return;
        setMessages(data.messages);
        setModel(data.conversation.model);
      })
      .catch(() => {
        if (cancelled) return;
        setActiveId(null);
        setUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingChat(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // Keep the newest message in view while the person stays at the bottom.
  useEffect(() => {
    const element = scroller.current;
    if (element && pinned.current) element.scrollTo({ top: element.scrollHeight, behavior: busy ? "smooth" : "auto" });
  }, [messages, status, notice, busy]);

  const onEvent = (event: AgentStreamEvent) => {
    switch (event.type) {
      case "conversation":
        startedHere.current = event.conversation.id;
        setActiveId(event.conversation.id);
        setUrl(event.conversation.id);
        break;
      case "message":
        setMessages((list) => withMessage(list, event.message));
        if (event.message.role === "assistant") setStatus({ state: "idle" });
        break;
      case "status":
        setStatus({ state: event.state, tool: event.tool });
        break;
      case "done":
        setUsage(event.usage);
        if (event.state === "interrupted") setNotice({ kind: "interrupted" });
        break;
      case "error":
        setNotice({ kind: "error", message: event.message, canContinue: true });
        break;
    }
  };

  /** Runs one streaming request; false when it was refused before anything was stored. */
  const run = async (path: string, body: unknown): Promise<boolean> => {
    pinned.current = true;
    setBusy(true);
    setNotice(null);
    setStatus({ state: "thinking" });
    try {
      await streamAgent(path, body, onEvent);
      return true;
    } catch (error) {
      if (error instanceof ApiClientError && error.status > 0) {
        setNotice({ kind: "error", message: error.message || t("common.requestFailed"), canContinue: false });
        return false;
      }
      setNotice({ kind: "error", message: t("ai.connectionLost"), canContinue: true });
      return true;
    } finally {
      setBusy(false);
      setStatus({ state: "idle" });
      context.reload();
    }
  };

  const ask = async (text: string): Promise<boolean> => {
    localIds.current -= 1;
    const optimistic: AgentMessageView = { id: localIds.current, role: "user", content: text, createdAt: "", toolCalls: [], results: [], actions: [] };
    // A new question declines open proposals on the server; mirror that here.
    setMessages((list) => [
      ...list.map((message) => ({ ...message, actions: message.actions.map((action) => (action.status === "pending" ? { ...action, status: "declined" as const } : action)) })),
      optimistic,
    ]);
    const accepted = await run("/api/ai/chat", { conversationId: activeId, text, model });
    if (!accepted) setMessages((list) => list.filter((message) => message.id !== optimistic.id));
    return accepted;
  };

  const confirm = async (action: AgentActionView, secrets: Record<string, string>) => {
    setMessages((list) => list.map((message) => ({ ...message, actions: message.actions.map((item) => (item.id === action.id ? { ...item, status: "running" as const } : item)) })));
    const accepted = await run(`/api/ai/actions/${action.id}/confirm`, { secrets });
    if (!accepted) {
      setMessages((list) => list.map((message) => ({ ...message, actions: message.actions.map((item) => (item.id === action.id ? action : item)) })));
    }
  };

  const decline = async (action: AgentActionView) => {
    try {
      const { data } = await api<AgentMessageView>(`/api/ai/actions/${action.id}/decline`, { method: "POST" });
      setMessages((list) => withMessage(list, data));
    } catch (error) {
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    }
  };

  const continueRun = () => activeId !== null && void run(`/api/ai/conversations/${activeId}/continue`, {});

  const openChat = (id: number | null) => {
    if (busy) return;
    setHistoryOpen(false);
    setNotice(null);
    setUsage(null);
    if (id === activeId) return;
    pinned.current = true;
    setMessages([]);
    setActiveId(id);
    setLoadingChat(id !== null);
    if (id === null) setModel(null);
    setUrl(id);
  };

  const rename = async () => {
    if (!renaming) return;
    const title = renaming.title.trim();
    setRenaming(null);
    if (!title) return;
    await api(`/api/ai/conversations/${renaming.id}`, { method: "PATCH", body: { title } }).catch(() => notify(t("common.requestFailed"), "error"));
    context.reload();
  };

  const remove = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    try {
      const { message } = await api(`/api/ai/conversations/${target.id}`, { method: "DELETE" });
      notify(message);
      if (target.id === activeId) openChat(null);
      context.reload();
    } catch {
      notify(t("common.requestFailed"), "error");
    }
  };

  const statusLabel = status.state === "tool" && status.tool ? t("ai.runningTool", { tool: t.dynamic(`ai.tools.${status.tool}`) }) : t("ai.thinking");
  const firstName = user.name.split(/\s+/)[0] ?? user.name;
  const starters = ASSISTANT_STARTERS.filter((starter) => tools.includes(starter.tool)).slice(0, 4);
  const quotaPercent = currentUsage?.limit ? Math.min(100, (currentUsage.requests / currentUsage.limit) * 100) : 0;

  const history = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 p-3">
        <button type="button" onClick={() => openChat(null)} disabled={busy} className={buttonClasses("secondary", "md", "w-full justify-start")}>
          <MessageSquarePlus className="size-4 text-accent" />
          {t("ai.newChat")}
        </button>
        <button type="button" onClick={() => setHistoryOpen(false)} aria-label={t("common.close")} className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sunken lg:hidden">
          <X className="size-5" />
        </button>
      </div>
      <p className="px-5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t("ai.chats")}</p>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {!context.data ? (
          <div className="space-y-2 px-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-4/5" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted">{t("ai.noChats")}</p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((conversation) => (
              <li key={conversation.id} className="group relative">
                {renaming?.id === conversation.id ? (
                  <input
                    autoFocus
                    value={renaming.title}
                    maxLength={80}
                    onChange={(event) => setRenaming({ id: conversation.id, title: event.target.value })}
                    onBlur={() => void rename()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void rename();
                      if (event.key === "Escape") setRenaming(null);
                    }}
                    className="w-full rounded-lg border border-accent-line px-3 py-2 text-sm focus:outline-none"
                    aria-label={t("ai.rename")}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => openChat(conversation.id)}
                    className={cn(
                      "w-full rounded-lg py-2 pl-3 pr-16 text-left text-sm",
                      conversation.id === activeId ? "bg-accent-soft font-semibold text-ink" : "text-ink-2 hover:bg-subtle hover:text-ink",
                    )}
                  >
                    <span className="block truncate">{conversation.title || t("ai.untitled")}</span>
                    <span className="block text-[11px] font-normal text-faint">{format.custom(conversation.lastMessageAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </button>
                )}
                {renaming?.id !== conversation.id ? (
                  <span className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 gap-0.5 group-focus-within:flex group-hover:flex">
                    <button type="button" onClick={() => setRenaming({ id: conversation.id, title: conversation.title })} aria-label={t("ai.rename")} className="inline-flex size-7 items-center justify-center rounded-md text-faint hover:bg-surface hover:text-ink">
                      <Pencil className="size-3.5" />
                    </button>
                    <button type="button" onClick={() => setDeleting(conversation)} aria-label={t("common.delete")} className="inline-flex size-7 items-center justify-center rounded-md text-faint hover:bg-surface hover:text-danger-ink">
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[460px] overflow-hidden rounded-panel border border-line bg-surface md:h-[calc(100dvh-7.5rem)]">
      {/* Chats */}
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface lg:block">{history}</aside>
      {historyOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-overlay" onClick={() => setHistoryOpen(false)} aria-hidden="true" />
          <aside className="relative h-full w-72 max-w-[85%] bg-surface shadow-float">{history}</aside>
        </div>
      ) : null}

      {/* Conversation */}
      <section className="flex min-w-0 flex-1 flex-col bg-canvas">
        <header className="flex items-center gap-2 border-b border-line bg-surface/85 px-4 py-2 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setHistoryOpen(true)} aria-label={t("ai.chats")} className="inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-sunken lg:hidden">
            <History className="size-5" />
          </button>
          {/* On phones the model picker needs the room; the page's own title stays in the top bar. */}
          <p className={cn("min-w-0 flex-1 truncate text-[15px] font-semibold text-ink", models.length > 1 && "max-sm:invisible")}>{active?.title || t("ai.title")}</p>
          {models.length > 1 ? (
            <select
              value={model ?? ""}
              onChange={(event) => setModel(event.target.value || null)}
              disabled={busy}
              aria-label={t("ai.model")}
              className="h-8 min-w-0 max-w-44 rounded-lg border border-line bg-surface px-2 text-xs font-medium text-ink-2 focus:border-accent focus:outline-none"
            >
              <option value="">{t("ai.modelDefault")}</option>
              {models.map((option) => (
                <option key={`${option.provider}:${option.model}`} value={option.model}>
                  {option.model}
                </option>
              ))}
            </select>
          ) : null}
          {currentUsage ? (
            <span className="flex shrink-0 items-center gap-2 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 ring-1 ring-line" title={t("ai.usageTitle")}>
              {currentUsage.limit !== null ? (
                <>
                  <span className="relative hidden h-1.5 w-12 overflow-hidden rounded-full bg-sunken sm:block">
                    <span className={cn("absolute inset-y-0 left-0 rounded-full", quotaPercent >= 90 ? "bg-danger" : "bg-primary")} style={{ width: `${quotaPercent}%` }} />
                  </span>
                  <span className="tabular-nums">
                    {format.number(currentUsage.requests)}/{format.number(currentUsage.limit)}
                  </span>
                </>
              ) : (
                <span className="tabular-nums">{t("ai.usageOwnShort", { used: format.number(currentUsage.requests) })}</span>
              )}
            </span>
          ) : null}
        </header>

        <div
          ref={scroller}
          onScroll={(event) => {
            const element = event.currentTarget;
            pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
          }}
          className="flex-1 overflow-y-auto"
        >
          {/* At least as tall as the area, so the first view can sit in its middle. */}
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            {loadingChat && messages.length === 0 ? (
              <div className="space-y-4">
                <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
                <Skeleton className="h-24 w-4/5 rounded-2xl" />
              </div>
            ) : messages.length === 0 ? (
              // The first view fits without scrolling: greeting, a short hint (wider screens) and the starters.
              <div className="my-auto">
                <div className="flex items-center gap-3">
                  <AssistantAvatar className="size-10 rounded-xl [&_svg]:size-5" />
                  <h1 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
                    {t("ai.greeting")} <span className="text-accent">{firstName}</span>
                  </h1>
                </div>
                <p className="mt-3 hidden max-w-xl text-sm leading-relaxed text-muted sm:block">{t("ai.greetingHint")}</p>
                {!context.data ? null : !configured ? (
                  <div className="mt-5 max-w-xl rounded-2xl border border-line bg-surface p-4 shadow-card">
                    <p className="flex items-center gap-2 font-semibold text-ink">
                      <Settings2 className="size-5 text-muted" />
                      {t("ai.notConfigured")}
                    </p>
                    <p className="mt-1 text-sm text-muted">{context.data.canConfigure ? t("ai.notConfiguredAdmin") : t("ai.notConfiguredStaff")}</p>
                    {context.data.canConfigure ? (
                      <Link href="/app/settings" className={buttonClasses("primary", "sm", "mt-4")}>
                        {t("ai.openSettings")}
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 grid gap-2 sm:mt-5 sm:grid-cols-2 sm:gap-2.5">
                    {starters.map((starter) => (
                      <button
                        key={starter.id}
                        type="button"
                        onClick={() => void ask(t.dynamic(`ai.starters.${starter.id}`))}
                        disabled={busy}
                        // On short phones the fourth starter would push the first view into scrolling.
                        className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left shadow-card transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float motion-reduce:hover:translate-y-0 max-sm:[@media(max-height:700px)]:[&:nth-child(4)]:hidden"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent transition group-hover:bg-primary group-hover:text-on-primary">
                          <starter.icon className="size-4" />
                        </span>
                        <span className="text-[13px] font-medium leading-snug text-ink">{t.dynamic(`ai.starters.${starter.id}`)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              messages.map((message, index) =>
                message.role === "user" ? (
                  <UserBubble key={message.id} message={message} />
                ) : (
                  <AssistantMessage
                    key={message.id}
                    message={message}
                    continued={messages[index - 1]?.role === "assistant"}
                    busy={busy}
                    onConfirm={(action, secrets) => void confirm(action, secrets)}
                    onDecline={(action) => void decline(action)}
                  />
                ),
              )
            )}
            {busy && status.state !== "idle" ? <ThinkingRow label={statusLabel} /> : null}
            {notice ? (
              <Alert tone={notice.kind === "error" ? "danger" : "info"}>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {notice.kind === "error" ? notice.message : t("ai.interrupted")}
                  {(notice.kind === "interrupted" || notice.canContinue) && activeId !== null ? (
                    <button type="button" onClick={continueRun} disabled={busy} className={buttonClasses("secondary", "sm")}>
                      <Play className="size-3.5" />
                      {t("ai.continue")}
                    </button>
                  ) : null}
                </span>
              </Alert>
            ) : null}
            <div ref={bottom} />
          </div>
        </div>

        <div className="border-t border-line bg-surface/85 px-4 pb-2.5 pt-2.5 backdrop-blur sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            <Composer tools={tools} busy={busy} disabled={!configured} initialText={initialQuestion} onSend={ask} />
            <p className="mt-1.5 text-center text-[11px] leading-4 text-faint">
              <span className="sm:hidden">{t("ai.disclaimerShort")}</span>
              <span className="hidden sm:inline">{t("ai.disclaimer")}</span>
            </p>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={deleting !== null}
        title={t("ai.deleteTitle")}
        description={deleting?.title}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
