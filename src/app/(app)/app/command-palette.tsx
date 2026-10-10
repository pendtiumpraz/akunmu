"use client";

import { AtSign, Boxes, CornerDownLeft, Laptop, Moon, Plus, Search, Sparkles, Waypoints, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { api, type Paginated } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { cn } from "@/shared/ui/cn";
import { setTheme, useTheme } from "@/shared/ui/theme";
import type { AccountListItem, MapData } from "./map-types";

type PaletteState = { isOpen: boolean; open: () => void; close: () => void; shortcut: string };

const subscribeNothing = () => () => undefined;

function isMac(): boolean {
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}

/** Opens the palette with Ctrl/⌘ K, or "/" outside text fields. */
export function useCommandPalette(enabled: boolean): PaletteState {
  const [isOpen, setOpen] = useState(false);
  const mac = useSyncExternalStore(subscribeNothing, isMac, () => false);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable=true]");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled]);
  return { isOpen, open: useCallback(() => setOpen(true), []), close: useCallback(() => setOpen(false), []), shortcut: mac ? "⌘K" : "Ctrl K" };
}

type Entry = { id: string; group: string; label: string; detail?: string; mono?: boolean; icon: LucideIcon; color?: string; run: () => void };

function matches(query: string, ...texts: (string | null | undefined)[]): number {
  if (!query) return 1;
  let best = 0;
  for (const text of texts) {
    const value = text?.toLowerCase() ?? "";
    if (value.startsWith(query)) best = Math.max(best, 3);
    else if (value.split(/[\s@._-]+/).some((word) => word.startsWith(query))) best = Math.max(best, 2);
    else if (value.includes(query)) best = Math.max(best, 1);
  }
  return best;
}

/** Search for devices, browser profiles, accounts and actions; Enter opens the highlighted one. */
export function CommandPalette({ state }: { state: PaletteState }) {
  const { t } = useI18n();
  const router = useRouter();
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [map, setMap] = useState<MapData | null>(null);
  const [accounts, setAccounts] = useState<{ query: string; items: AccountListItem[] }>({ query: "", items: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { isOpen, close } = state;
  const needle = query.trim().toLowerCase();

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    api<MapData>("/api/map", { signal: controller.signal })
      .then((result) => setMap(result.data))
      .catch(() => undefined);
    inputRef.current?.focus();
    return () => controller.abort();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || needle.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api<Paginated<AccountListItem>>(`/api/accounts?${new URLSearchParams({ search: needle, per_page: "6" })}`, { signal: controller.signal })
        .then((result) => setAccounts({ query: needle, items: result.data.items }))
        .catch(() => undefined);
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, needle]);

  const finish = useCallback(() => {
    close();
    setQuery("");
    setActive(0);
  }, [close]);

  const go = useCallback(
    (href: string) => {
      finish();
      router.push(href);
    },
    [finish, router],
  );

  const entries = useMemo(() => {
    const result: { entry: Entry; score: number }[] = [];
    const add = (entry: Entry, score: number) => {
      if (score > 0) result.push({ entry, score });
    };
    for (const device of map?.devices ?? []) {
      add(
        { id: `device-${device.id}`, group: t("palette.groupDevices"), label: device.name, detail: device.location ?? undefined, icon: Laptop, color: "#3B82F6", run: () => go(`/app?device=${device.id}`) },
        matches(needle, device.name, device.location),
      );
    }
    for (const profile of map?.profiles ?? []) {
      const device = map?.devices.find((candidate) => candidate.id === profile.deviceId);
      if (!device) continue;
      add(
        {
          id: `profile-${profile.id}`,
          group: t("palette.groupProfiles"),
          label: profile.name,
          detail: device.name,
          icon: Waypoints,
          color: profile.color ?? "#14B8A6",
          run: () => go(`/app?device=${device.id}&place=p:${profile.id}`),
        },
        needle ? matches(needle, profile.name) : 0,
      );
    }
    const accountItems = needle.length >= 2 && accounts.query === needle ? accounts.items : [];
    for (const account of accountItems) {
      add(
        {
          id: `account-${account.id}`,
          group: t("palette.groupAccounts"),
          label: account.identifier,
          detail: [account.provider.name, account.label].filter(Boolean).join(" · "),
          mono: true,
          icon: AtSign,
          color: account.provider.color,
          run: () => go(`/app/accounts/${account.id}`),
        },
        2,
      );
    }
    const actions: [Entry, string][] = [
      [{ id: "record", group: t("palette.groupActions"), label: t("palette.recordSignIn"), icon: Plus, color: "#14B8A6", run: () => go("/app?record=1") }, t("palette.recordSignIn")],
      [{ id: "add-device", group: t("palette.groupActions"), label: t("palette.addDevice"), icon: Laptop, color: "#3B82F6", run: () => go("/app/devices?new=1") }, t("palette.addDevice")],
      [{ id: "accounts", group: t("palette.groupActions"), label: t("palette.openAccounts"), icon: AtSign, color: "#F59E0B", run: () => go("/app/accounts") }, t("palette.openAccounts")],
      [{ id: "providers", group: t("palette.groupActions"), label: t("palette.openProviders"), icon: Boxes, color: "#A855F7", run: () => go("/app/providers") }, t("palette.openProviders")],
      [
        {
          id: "theme",
          group: t("palette.groupActions"),
          label: t("palette.toggleTheme"),
          icon: Moon,
          color: "#64748B",
          run: () => {
            setTheme(theme === "dark" ? "light" : "dark");
            finish();
          },
        },
        t("palette.toggleTheme"),
      ],
    ];
    for (const [entry, text] of actions) add(entry, needle ? matches(needle, text) : 1);
    add(
      {
        id: "ask",
        group: t("palette.groupAssistant"),
        label: needle ? t("palette.askAbout", { query: query.trim() }) : t("palette.openAssistant"),
        icon: Sparkles,
        color: "#EC4899",
        run: () => go(needle ? `/app/assistant?q=${encodeURIComponent(query.trim())}` : "/app/assistant"),
      },
      needle ? 0.5 : 1,
    );
    const groups = [t("palette.groupDevices"), t("palette.groupProfiles"), t("palette.groupAccounts"), t("palette.groupActions"), t("palette.groupAssistant")];
    return result
      .sort((a, b) => groups.indexOf(a.entry.group) - groups.indexOf(b.entry.group) || b.score - a.score)
      .slice(0, 40)
      .map((item) => item.entry);
  }, [map, accounts, needle, query, t, go, theme, finish]);

  const selected = Math.min(active, Math.max(0, entries.length - 1));

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!isOpen || typeof document === "undefined") return null;

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(Math.min(selected + 1, entries.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(selected - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      entries[selected]?.run();
    } else if (event.key === "Escape") {
      finish();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[10vh]">
      <div className="absolute inset-0 animate-fade-in bg-overlay" onClick={finish} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={t("palette.title")} className="relative w-full max-w-xl animate-pop overflow-hidden rounded-2xl border border-line bg-surface shadow-float">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t("palette.placeholder")}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={entries[selected] ? `palette-${entries[selected].id}` : undefined}
            className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line px-1.5 font-mono text-[11px] text-faint">Esc</kbd>
        </div>
        <div ref={listRef} id="palette-results" role="listbox" className="scroll-thin max-h-[56vh] overflow-y-auto p-1.5">
          {entries.length === 0 ? <p className="px-3 py-8 text-center text-sm text-muted">{t("palette.empty")}</p> : null}
          {entries.map((entry, index) => {
            const header = index === 0 || entries[index - 1].group !== entry.group ? entry.group : null;
            const isActive = index === selected;
            return (
              <div key={entry.id}>
                {header ? <p className="px-3 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-faint">{header}</p> : null}
                <button
                  type="button"
                  id={`palette-${entry.id}`}
                  role="option"
                  aria-selected={isActive}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={entry.run}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", isActive ? "bg-accent-soft" : "hover:bg-subtle")}
                >
                  <entry.icon className="size-4 shrink-0" style={{ color: entry.color }} />
                  <span className={cn("min-w-0 flex-1 truncate text-sm text-ink", entry.mono && "font-mono text-[13px]")}>{entry.label}</span>
                  {entry.detail ? <span className="max-w-[40%] truncate text-xs text-muted">{entry.detail}</span> : null}
                  {isActive ? <CornerDownLeft className="size-3.5 shrink-0 text-faint" /> : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
