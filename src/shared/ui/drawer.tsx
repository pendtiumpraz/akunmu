"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "./use-client";

/**
 * Right-side drawer for every create/edit form (loop-v5 rule #5):
 * 400px wide (full width below 768px), slides in over 300ms, rgba(0,0,0,0.5) backdrop,
 * closes with the X button, the backdrop or Escape.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  closeLabel,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  closeLabel: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // The server renders nothing here; the portal appears right after hydration (a drawer open on the first render).
  const isClient = useIsClient();

  useEffect(() => {
    if (!open || !isClient) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTarget = panelRef.current?.querySelector<HTMLElement>("[data-autofocus], input, select, textarea");
    focusTarget?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose, isClient]);

  if (!open || !isClient) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-overlay" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-full animate-drawer-in flex-col border-l border-line bg-surface shadow-float md:w-[400px]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold leading-6 text-ink">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <footer className="flex items-center justify-end gap-2 border-t border-line bg-subtle px-5 py-3">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
