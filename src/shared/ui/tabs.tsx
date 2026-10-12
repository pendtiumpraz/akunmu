"use client";

import { useCallback, useState, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Tabs for pages that would otherwise stack long sections (settings, the privacy area, record editors).
 * The active tab lives in the URL (?tab=…) so a refresh or a shared link opens the same tab; the server page
 * reads it and passes it as the initial tab.
 */
export type TabItem<K extends string> = { key: K; label: ReactNode; icon?: ReactNode; badge?: ReactNode };

export function useUrlTab<K extends string>(keys: readonly K[], initial: K | null | undefined, param = "tab"): [K, (next: K) => void] {
  const [tab, setTab] = useState<K>(initial && keys.includes(initial) ? initial : keys[0]);
  const select = useCallback(
    (next: K) => {
      setTab(next);
      const url = new URL(window.location.href);
      url.searchParams.set(param, next);
      window.history.replaceState(window.history.state, "", url);
    },
    [param],
  );
  return [tab, select];
}

/** Horizontal tab bar (underlined, scrolls sideways on phones), styled like the settings tabs. */
export function TabBar<K extends string>({ tabs, active, onSelect, className }: { tabs: TabItem<K>[]; active: K; onSelect: (key: K) => void; className?: string }) {
  return (
    <div className={cn("-mx-3 overflow-x-auto border-b border-line px-3 sm:mx-0 sm:px-0", className)}>
      <div role="tablist" className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(tab.key)}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                selected ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.badge}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Vertical section list for long record editors: a column on wide screens, a scrolling row on phones.
 * Each item can carry a status dot (e.g. sections that still miss required fields).
 */
export function SideTabs<K extends string>({
  tabs,
  active,
  onSelect,
  children,
}: {
  tabs: Array<TabItem<K> & { attention?: boolean }>;
  active: K;
  onSelect: (key: K) => void;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="-mx-3 overflow-x-auto px-3 lg:mx-0 lg:overflow-visible lg:px-0">
        <div role="tablist" aria-orientation="vertical" className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col">
          {tabs.map((tab) => {
            const selected = tab.key === active;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelect(tab.key)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold transition-colors",
                  selected ? "bg-accent-soft text-accent" : "text-muted hover:bg-subtle hover:text-ink",
                )}
              >
                {tab.icon}
                <span className="lg:flex-1">{tab.label}</span>
                {tab.attention ? <span className="size-2 shrink-0 rounded-full bg-warn" aria-hidden="true" /> : null}
                {tab.badge}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
