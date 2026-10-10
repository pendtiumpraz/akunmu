"use client";

import { ArrowUp, AtSign, Slash } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { mentionToken, type MentionKind } from "@/modules/ai/agent-types";
import { api, type Paginated } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { cn } from "@/shared/ui/cn";
import type { AccountListItem, DeviceListItem } from "../map-types";
import { DeviceIcon, ProviderAvatar } from "../ui";
import { ASSISTANT_COMMANDS, type AssistantCommand } from "./commands";

type MentionOption =
  | { kind: "device"; id: number; title: string; device: DeviceListItem }
  | { kind: "account"; id: number; title: string; account: AccountListItem };
type Mention = { kind: MentionKind; id: number; title: string };
/** The word being typed right before the caret that opened a menu: "/wher" or "@kerja". */
type Trigger = { kind: "command" | "mention"; query: string; start: number };

const TRIGGER = /(^|\s)([/@])([^\s/@]{0,40})$/;
const MAX_HEIGHT = 200;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "@Name" as typed becomes @[Name](device:ID) or @[Name](account:ID) for the server; longer names first. */
function withTokens(text: string, mentions: Mention[]): string {
  return [...mentions]
    .sort((a, b) => b.title.length - a.title.length)
    .reduce((current, mention) => current.split(`@${mention.title}`).join(mentionToken(mention.title, mention.kind, mention.id)), text);
}

function findTrigger(text: string, caret: number): Trigger | null {
  const match = TRIGGER.exec(text.slice(0, caret));
  if (!match) return null;
  return { kind: match[2] === "/" ? "command" : "mention", query: match[3], start: caret - match[3].length - 1 };
}

/**
 * The chat input: Enter sends, Shift+Enter adds a line. "/" opens the commands (ready questions) and "@" the device
 * and account picker; a picked one shows as @Name (highlighted) and is sent as a mention the assistant can resolve.
 */
export function Composer({
  tools,
  busy,
  disabled,
  initialText = "",
  onSend,
}: {
  tools: string[];
  busy: boolean;
  disabled: boolean;
  initialText?: string;
  onSend: (text: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(initialText);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  const [options, setOptions] = useState<{ query: string; items: MentionOption[] } | null>(null);
  const [filter, setFilter] = useState<MentionKind | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  /** Caret to restore right after a programmatic change, before the next keystroke lands. */
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const element = textarea.current;
    if (element) {
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`;
      element.style.overflowY = element.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
    }
    if (pendingCaret.current === null || !element) return;
    element.focus();
    element.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [text]);

  const commands = ASSISTANT_COMMANDS.filter((command) => tools.includes(command.tool)).filter((command) => {
    if (trigger?.kind !== "command") return false;
    const query = trigger.query.toLowerCase();
    return !query || t.dynamic(`ai.commands.${command.id}.trigger`).toLowerCase().includes(query) || t.dynamic(`ai.commands.${command.id}.label`).toLowerCase().includes(query);
  });
  const mentionQuery = trigger?.kind === "mention" ? trigger.query : null;
  const found = mentionQuery !== null && options?.query === mentionQuery ? options.items : [];
  const choices = filter ? found.filter((option) => option.kind === filter) : found;
  const items = trigger?.kind === "command" ? commands.length : choices.length;

  // Devices and accounts for the @ picker (debounced).
  useEffect(() => {
    if (mentionQuery === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const needle = mentionQuery.toLowerCase();
      const accountParams = new URLSearchParams({ per_page: "6", ...(mentionQuery ? { search: mentionQuery } : {}) });
      Promise.all([
        api<DeviceListItem[]>("/api/devices", { signal: controller.signal }),
        api<Paginated<AccountListItem>>(`/api/accounts?${accountParams}`, { signal: controller.signal }),
      ])
        .then(([devices, accounts]) =>
          setOptions({
            query: mentionQuery,
            items: [
              ...devices.data
                .filter((device) => !needle || device.name.toLowerCase().includes(needle))
                .slice(0, 6)
                .map((device): MentionOption => ({ kind: "device", id: device.id, title: device.name, device })),
              ...accounts.data.items.map((account): MentionOption => ({ kind: "account", id: account.id, title: account.identifier, account })),
            ],
          }),
        )
        .catch(() => undefined);
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mentionQuery]);

  const update = (value: string, caret: number) => {
    setText(value);
    const next = findTrigger(value, caret);
    setTrigger(next);
    if (next?.kind !== trigger?.kind || next?.query !== trigger?.query) setActive(0);
    if (next?.kind !== "mention") setFilter(null);
  };

  const place = (value: string, caret: number) => {
    pendingCaret.current = caret;
    update(value, caret);
  };

  /** Replaces the word that opened the menu (through its end, even with the caret inside it). */
  const replaceTrigger = (current: Trigger, insert: string) => {
    const after = text.slice(current.start + 1 + current.query.length).replace(/^[^\s]*/, "");
    place(`${text.slice(0, current.start)}${insert}${after}`, current.start + insert.length);
  };

  const pickCommand = (command: AssistantCommand) => {
    if (!trigger) return;
    const prompt = t.dynamic(`ai.commands.${command.id}.prompt`);
    replaceTrigger(trigger, command.mention ? `${prompt} @` : prompt);
    if (command.mention) setFilter(command.mention);
  };

  const pickMention = (option: MentionOption) => {
    if (!trigger) return;
    setMentions((current) => [...current.filter((mention) => !(mention.kind === option.kind && mention.id === option.id) && mention.title !== option.title), { kind: option.kind, id: option.id, title: option.title }]);
    setFilter(null);
    replaceTrigger(trigger, `@${option.title} `);
  };

  const openMenu = (symbol: "/" | "@") => {
    const element = textarea.current;
    const caret = element?.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const insert = before && !/\s$/.test(before) ? ` ${symbol}` : symbol;
    place(`${before}${insert}${text.slice(caret)}`, caret + insert.length);
  };

  const submit = async () => {
    const plain = text.trim();
    if (!plain || busy || disabled) return;
    const present = mentions.filter((mention) => plain.includes(`@${mention.title}`));
    setText("");
    setTrigger(null);
    if (await onSend(withTokens(plain, present))) setMentions([]);
    else setText(plain);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (trigger && items > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive((current) => (current + (event.key === "ArrowDown" ? 1 : items - 1)) % items);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        if (trigger.kind === "command") pickCommand(commands[Math.min(active, commands.length - 1)]);
        else pickMention(choices[Math.min(active, choices.length - 1)]);
        return;
      }
    }
    if (trigger && event.key === "Escape") {
      event.preventDefault();
      setTrigger(null);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  // Highlight of typed mentions, drawn behind the transparent textarea.
  const known = mentions.filter((mention) => text.includes(`@${mention.title}`));
  const pattern = known.length ? new RegExp(`(${known.map((mention) => escapeRegExp(`@${mention.title}`)).join("|")})`, "g") : null;
  const highlighted = pattern ? text.split(pattern) : [text];

  return (
    <div className="relative">
      {trigger && (trigger.kind === "command" || mentionQuery !== null) ? (
        <div className="absolute inset-x-0 bottom-full z-20 mb-2 animate-pop overflow-hidden rounded-xl border border-line bg-surface shadow-float" role="listbox">
          <p className="border-b border-line px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-faint">
            {trigger.kind === "command" ? t("ai.commandsTitle") : filter === "device" ? t("ai.mentionDeviceTitle") : filter === "account" ? t("ai.mentionAccountTitle") : t("ai.mentionTitle")}
          </p>
          <div className="scroll-thin max-h-72 overflow-y-auto p-1">
            {trigger.kind === "command" ? (
              commands.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted">{t("ai.commandsEmpty")}</p>
              ) : (
                commands.map((command, index) => (
                  <button
                    key={command.id}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pickCommand(command)}
                    onMouseEnter={() => setActive(index)}
                    className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left", index === active ? "bg-accent-soft" : "hover:bg-subtle")}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-accent">
                      <command.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">
                        <span className="font-mono text-accent">/{t.dynamic(`ai.commands.${command.id}.trigger`)}</span> {t.dynamic(`ai.commands.${command.id}.label`)}
                      </span>
                      <span className="block truncate text-xs text-muted">{t.dynamic(`ai.commands.${command.id}.prompt`)}…</span>
                    </span>
                  </button>
                ))
              )
            ) : choices.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">{options?.query === mentionQuery ? t("ai.mentionEmpty") : t("common.loading")}</p>
            ) : (
              choices.map((option, index) => (
                <button
                  key={`${option.kind}-${option.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(mouse) => mouse.preventDefault()}
                  onClick={() => pickMention(option)}
                  onMouseEnter={() => setActive(index)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left", index === active ? "bg-accent-soft" : "hover:bg-subtle")}
                >
                  {option.kind === "device" ? (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2">
                      <DeviceIcon kind={option.device.kind} />
                    </span>
                  ) : (
                    <ProviderAvatar provider={option.account.provider} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm font-semibold text-ink", option.kind === "account" && "font-mono text-[13px]")}>{option.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {option.kind === "device" ? t("ai.mentionDevice") : [option.account.provider.name, option.account.label].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "rounded-2xl border bg-surface shadow-card transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft",
          disabled ? "border-line opacity-70" : "border-line-strong",
        )}
      >
        <div className="relative">
          <div
            ref={mirror}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-4 pb-2 pt-3.5 text-[15px] leading-6 text-transparent"
          >
            {highlighted.map((part, index) => (pattern && index % 2 === 1 ? <mark key={index} className="rounded bg-accent-soft text-transparent">{part}</mark> : <span key={index}>{part}</span>))}
            {"​"}
          </div>
          <textarea
            ref={textarea}
            rows={1}
            value={text}
            disabled={disabled}
            onChange={(event) => update(event.target.value, event.target.selectionStart)}
            onKeyDown={onKeyDown}
            onClick={(event) => setTrigger(findTrigger(text, event.currentTarget.selectionStart))}
            onScroll={(event) => {
              if (mirror.current) mirror.current.scrollTop = event.currentTarget.scrollTop;
            }}
            onBlur={() => window.setTimeout(() => setTrigger(null), 120)}
            placeholder={t("ai.placeholder")}
            aria-label={t("ai.placeholder")}
            className="relative block max-h-[200px] w-full resize-none overflow-hidden bg-transparent px-4 pb-2 pt-3.5 text-[15px] leading-6 text-ink placeholder:text-faint focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          <button type="button" onClick={() => openMenu("/")} disabled={disabled} title={t("ai.commandsTitle")} aria-label={t("ai.commandsTitle")} className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-ink">
            <Slash className="size-4" />
          </button>
          <button type="button" onClick={() => openMenu("@")} disabled={disabled} title={t("ai.mentionTitle")} aria-label={t("ai.mentionTitle")} className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-ink">
            <AtSign className="size-4" />
          </button>
          <p className="ml-1 hidden truncate text-xs text-faint sm:block">{t("ai.composerHint")}</p>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!text.trim() || busy || disabled}
            aria-label={t("ai.send")}
            className="inline-flex size-9 items-center justify-center rounded-xl bg-primary text-on-primary transition hover:bg-primary-hover disabled:bg-sunken disabled:text-faint"
          >
            <ArrowUp className="size-[18px]" strokeWidth={2.6} />
          </button>
        </div>
      </div>
    </div>
  );
}
