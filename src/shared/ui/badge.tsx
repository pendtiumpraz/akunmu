import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "accent" | "ok" | "warn" | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-ink-2",
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  danger: "bg-danger-soft text-danger-ink",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: BadgeTone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-semibold", TONES[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** Colors of statuses and roles used across the app. */
export const STATUS_TONES: Record<string, BadgeTone> = {
  admin: "danger",
  editor: "accent",
  viewer: "neutral",
  trial: "warn",
  active: "ok",
  suspended: "danger",
  cancelled: "neutral",
  signed_in: "ok",
  signed_out: "neutral",
};
