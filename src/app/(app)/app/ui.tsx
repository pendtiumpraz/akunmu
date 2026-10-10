"use client";

import { HardDrive, Laptop, Monitor, Smartphone, Tablet, type LucideIcon } from "lucide-react";
import type { Translator } from "@/shared/i18n/translate";
import { BROWSER_NAMES, SYSTEM_NAMES, type Browser, type DeviceKind, type DeviceSystem } from "@/modules/devices/types";
import { useI18n } from "@/shared/i18n/client";
import { cn } from "@/shared/ui/cn";

/** Small pieces of the sign-in map shared by its screens: provider avatars, device icons, browser marks. */

const KIND_ICONS: Record<DeviceKind, LucideIcon> = { laptop: Laptop, desktop: Monitor, phone: Smartphone, tablet: Tablet, other: HardDrive };

/** Each browser's own color, for its mark. */
const BROWSER_COLORS: Record<Browser, string> = {
  chrome: "#4285F4",
  edge: "#0C59A4",
  firefox: "#FF7139",
  safari: "#0FB5EE",
  brave: "#FB542B",
  opera: "#FF1B2D",
  arc: "#E8604C",
  other: "#64748B",
};

export function kindLabel(kind: DeviceKind, t: Translator): string {
  return t.dynamic(`devices.kind_${kind}`);
}

export function systemLabel(system: DeviceSystem, t: Translator): string {
  return system === "other" ? t("devices.systemOther") : SYSTEM_NAMES[system];
}

export function browserLabel(browser: Browser, t: Translator): string {
  return browser === "other" ? t("devices.browserOther") : BROWSER_NAMES[browser];
}

/** Dark or light text, whichever reads better on a brand color. */
function textOn(hex: string): string {
  const value = Number.parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.36 ? "#0e1726" : "#ffffff";
}

function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return name.trim().slice(0, 2).replace(/^./, (first) => first.toUpperCase());
}

/** A provider's identity: its initials on its own color. */
export function ProviderAvatar({ provider, size = "md", className }: { provider: { name: string; color: string }; size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = { sm: "size-6 rounded-md text-[10px]", md: "size-8 rounded-lg text-xs", lg: "size-11 rounded-xl text-sm" } as const;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center font-bold tracking-tight", sizes[size], className)}
      style={{ backgroundColor: provider.color, color: textOn(provider.color) }}
    >
      {monogram(provider.name)}
    </span>
  );
}

export function DeviceIcon({ kind, className }: { kind: DeviceKind; className?: string }) {
  const Icon = KIND_ICONS[kind] ?? HardDrive;
  return <Icon className={cn("size-4", className)} aria-hidden="true" />;
}

/** A browser's mark: its initial on its color, with the profile's own color as a dot. */
export function BrowserMark({ browser, color, className }: { browser: Browser; color?: string | null; className?: string }) {
  const base = BROWSER_COLORS[browser] ?? BROWSER_COLORS.other;
  return (
    <span aria-hidden="true" className={cn("relative inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold", className)} style={{ backgroundColor: base, color: textOn(base) }}>
      {browser === "other" ? "•" : BROWSER_NAMES[browser][0]}
      {color ? <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-surface" style={{ backgroundColor: color }} /> : null}
    </span>
  );
}

/** "Confirmed 3 days ago", amber when it should be checked again. */
export function Freshness({ lastVerifiedAt, stale, className }: { lastVerifiedAt: string; stale: boolean; className?: string }) {
  const { t, format } = useI18n();
  return (
    <span className={cn("text-xs", stale ? "font-semibold text-warn-ink" : "text-muted", className)} title={format.dateTime(lastVerifiedAt)}>
      {t("signIns.confirmedAgo", { when: format.relativeDays(lastVerifiedAt) })}
    </span>
  );
}

export function shortDate(value: string, format: { custom: (value: string, options: Intl.DateTimeFormatOptions) => string }): string {
  return format.custom(value.length === 10 ? `${value}T00:00:00Z` : value, { day: "numeric", month: "short", year: "numeric", ...(value.length === 10 ? { timeZone: "UTC" } : {}) });
}
