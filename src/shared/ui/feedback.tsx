import { AlertTriangle, CheckCircle2, Info, RefreshCw, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-sunken", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 flex size-11 items-center justify-center rounded-xl border border-line bg-subtle text-muted">{icon}</div> : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  retryLabel,
  onRetry,
}: {
  title: ReactNode;
  description?: ReactNode;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-danger-soft text-danger-ink">
        <XCircle className="size-5" />
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p> : null}
      {onRetry && retryLabel ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:bg-subtle"
        >
          <RefreshCw className="size-4" />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

const ALERT_TONES = {
  info: { box: "border-accent-line bg-accent-soft text-accent", Icon: Info },
  success: { box: "border-ok-line bg-ok-soft text-ok-ink", Icon: CheckCircle2 },
  warning: { box: "border-warn-line bg-warn-soft text-warn-ink", Icon: AlertTriangle },
  danger: { box: "border-danger-line bg-danger-soft text-danger-ink", Icon: XCircle },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof ALERT_TONES;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = ALERT_TONES[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-3.5 py-3 text-[13px]", box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="leading-5 opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}
