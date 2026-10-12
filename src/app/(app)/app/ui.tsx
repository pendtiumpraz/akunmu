"use client";

import {
  AppWindow,
  BellRing,
  Globe,
  HardDrive,
  KeyRound,
  Laptop,
  Link2,
  Monitor,
  MonitorSmartphone,
  QrCode,
  Smartphone,
  SquareTerminal,
  Tablet,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import type { Translator } from "@/shared/i18n/translate";
import {
  BROWSER_NAMES,
  SYSTEM_NAMES,
  isCliTool,
  profileClientName,
  type Browser,
  type CliTool,
  type DeviceKind,
  type DeviceSystem,
  type ProfileClient,
} from "@/modules/devices/types";
import type { AppKind, ApprovalMethod } from "@/modules/signins/types";
import { useI18n } from "@/shared/i18n/client";
import { cn } from "@/shared/ui/cn";
import type { MapSignIn } from "./map-types";

/** Small pieces of the sign-in map shared by its screens: provider avatars, device icons, browser and app marks. */

const KIND_ICONS: Record<DeviceKind, LucideIcon> = { laptop: Laptop, desktop: Monitor, phone: Smartphone, tablet: Tablet, other: HardDrive };

/**
 * Providers drawn with their own glyph from public/brands/providers (Simple Icons, CC0); the others show their
 * initials. The glyph takes the text color that reads best on the provider's color.
 */
export const PROVIDER_LOGOS: ReadonlySet<string> = new Set([
  "apple",
  "claude",
  "cloudflare",
  "discord",
  "facebook",
  "figma",
  "github",
  "gitlab",
  "google",
  "instagram",
  "netflix",
  "notion",
  "shopee",
  "spotify",
  "telegram",
  "vercel",
  "whatsapp",
  "x",
  "zoom",
]);

export function kindLabel(kind: DeviceKind, t: Translator): string {
  return t.dynamic(`devices.kind_${kind}`);
}

export function systemLabel(system: DeviceSystem, t: Translator): string {
  return system === "other" ? t("devices.systemOther") : SYSTEM_NAMES[system];
}

export function browserLabel(browser: Browser, t: Translator): string {
  return browser === "other" ? t("devices.browserOther") : BROWSER_NAMES[browser];
}

/** What a profile belongs to: the browser, or the command-line tool ("Claude Code"). */
export function profileClientLabel(client: ProfileClient, t: Translator): string {
  return profileClientName(client) ?? t("devices.browserOther");
}

/** Where a sign-in is, short: "Chrome · Work", "Claude Code · claude-work", "Gmail app", "Claude Code (CLI)" or "On the device". */
export function placeLabel(row: Pick<MapSignIn, "profile" | "app" | "appKind">, t: Translator): string {
  if (row.profile) return `${profileClientLabel(row.profile.browser, t)} · ${row.profile.name}`;
  if (row.app) return row.appKind === "cli" ? t("signIns.cliPlace", { app: row.app }) : row.app;
  return t("signIns.deviceItself");
}

export const APPROVAL_ICONS: Record<ApprovalMethod, LucideIcon> = { code: KeyRound, link: Link2, qr: QrCode, prompt: BellRing };

/** How a sign-in was let in from another place: "code", "link", "QR", "prompt" (or just "another place"). */
export function approvalLabel(method: ApprovalMethod | null, t: Translator): string {
  return method ? t.dynamic(`signIns.approval_${method}`) : t("signIns.approvalAny");
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

/** A provider's identity: its glyph (or initials) on its own color. */
export function ProviderAvatar({
  provider,
  size = "md",
  className,
}: {
  provider: { name: string; color: string; slug?: string | null };
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = { sm: "size-6 rounded-md text-[10px]", md: "size-8 rounded-lg text-xs", lg: "size-11 rounded-xl text-sm" } as const;
  const glyphs = { sm: "size-3.5", md: "size-4", lg: "size-6" } as const;
  const logo = provider.slug && PROVIDER_LOGOS.has(provider.slug) ? `url(/brands/providers/${provider.slug}.svg)` : null;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center font-bold tracking-tight", sizes[size], className)}
      style={{ backgroundColor: provider.color, color: textOn(provider.color) }}
    >
      {logo ? (
        <span
          className={cn("bg-current", glyphs[size])}
          style={{ maskImage: logo, WebkitMaskImage: logo, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }}
        />
      ) : (
        monogram(provider.name)
      )}
    </span>
  );
}

export function DeviceIcon({ kind, className }: { kind: DeviceKind; className?: string }) {
  const Icon = KIND_ICONS[kind] ?? HardDrive;
  return <Icon className={cn("size-4", className)} aria-hidden="true" />;
}

/**
 * A browser's own logo (public/brands/browsers, from the MIT-licensed alrra/browser-logos; Arc from Simple Icons),
 * with the profile's color as a dot.
 */
export function BrowserMark({ browser, color, className }: { browser: Browser; color?: string | null; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("relative inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface ring-1 ring-line", className)}>
      {browser === "other" ? (
        <Globe className="size-4 text-muted" />
      ) : (
        <Image src={`/brands/browsers/${browser}.svg`} alt="" width={20} height={20} unoptimized draggable={false} className="size-5" />
      )}
      {color ? <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-surface" style={{ backgroundColor: color }} /> : null}
    </span>
  );
}

/** Command-line tools drawn with their maker's glyph (public/brands/providers) in its color, on a terminal tile. */
const CLI_GLYPHS: Record<CliTool, { src: string; color: string }> = { "claude-code": { src: "/brands/providers/claude.svg", color: "#D97757" } };

/** A profile's mark: its browser's logo, or for a command-line profile a terminal tile with the tool's glyph. */
export function ProfileMark({ client, color, className }: { client: ProfileClient; color?: string | null; className?: string }) {
  if (!isCliTool(client)) return <BrowserMark browser={client} color={color} className={className} />;
  const glyph = CLI_GLYPHS[client];
  const mask = `url(${glyph.src})`;
  return (
    <span aria-hidden="true" className={cn("relative inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink", className)}>
      <span
        className="size-4"
        style={{ backgroundColor: glyph.color, maskImage: mask, WebkitMaskImage: mask, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }}
      />
      {color ? <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-surface" style={{ backgroundColor: color }} /> : null}
    </span>
  );
}

/** A place on the device itself: an app, a command-line tool (dark, like a terminal) or the system. */
export function AppMark({ kind, className }: { kind: AppKind | null; className?: string }) {
  const Icon = kind === "cli" ? SquareTerminal : kind === "app" ? AppWindow : MonitorSmartphone;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-lg", kind === "cli" ? "bg-ink text-canvas" : "bg-sunken text-ink-2", className)}
    >
      <Icon className="size-4" />
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
