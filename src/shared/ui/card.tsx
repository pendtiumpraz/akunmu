import type { ReactNode } from "react";
import { cn } from "./cn";

/** A panel: thin border, 12px corners, no side accents. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-panel border border-line bg-surface", className)}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold leading-5 text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** A number with its label; `tone` colors the small icon tile. */
export function StatCard({
  label,
  value,
  icon,
  tone = "accent",
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  icon: ReactNode;
  tone?: "accent" | "ok" | "warn" | "danger" | "neutral";
  hint?: ReactNode;
}) {
  const tones = {
    accent: "bg-accent-soft text-accent",
    ok: "bg-ok-soft text-ok-ink",
    warn: "bg-warn-soft text-warn-ink",
    danger: "bg-danger-soft text-danger-ink",
    neutral: "bg-sunken text-ink-2",
  } as const;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tones[tone])}>{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-muted">{label}</p>
          <p className="text-xl font-bold leading-7 tracking-tight text-ink tabular-nums">{value}</p>
        </div>
      </div>
      {hint ? <p className="mt-3 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">{eyebrow}</div> : null}
        <h1 className="text-xl font-bold leading-7 tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[13px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
