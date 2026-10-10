"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./button";
import { useIsClient } from "./use-client";

/** Small confirmation dialog for destructive or important actions (delete, restore, sign out). */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const isClient = useIsClient();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || !isClient) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-overlay" onClick={onCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-sm animate-pop rounded-panel border border-line bg-surface p-5 shadow-float"
      >
        <div className="flex gap-3">
          <div
            className={
              tone === "danger"
                ? "flex size-9 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger-ink"
                : "flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"
            }
          >
            {tone === "danger" ? <AlertTriangle className="size-4" /> : <RotateCcw className="size-4" />}
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold leading-6 text-ink">
              {title}
            </h2>
            {description ? <div className="mt-1 text-[13px] leading-5 text-muted">{description}</div> : null}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading} data-autofocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
