"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useI18n } from "../i18n/client";
import { cn } from "./cn";

/**
 * Light, dark or the system's theme. The choice lives in localStorage and becomes `data-theme` on <html>;
 * THEME_SCRIPT applies it before the first paint so the page never flashes the other theme.
 */
export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "akunmu-theme";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

const listeners = new Set<() => void>();

function readChoice(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setTheme(choice: ThemeChoice): void {
  try {
    if (choice === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
  }
  if (choice === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
  listeners.forEach((listener) => listener());
}

export function useTheme(): ThemeChoice {
  return useSyncExternalStore(subscribe, readChoice, () => "system");
}

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

/** One button that cycles system → light → dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const choice = useTheme();
  const Icon = ICONS[choice];
  const label = t("theme.toggle", { theme: t.dynamic(`theme.${choice}`) });
  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[choice])}
      aria-label={label}
      title={label}
      className={cn("inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink", className)}
    >
      <Icon className="size-4" />
    </button>
  );
}
