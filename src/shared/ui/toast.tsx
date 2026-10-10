"use client";

import { CheckCircle2, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/client";

type ToastTone = "success" | "error";
type ToastItem = { id: number; tone: ToastTone; message: string };

const ToastContext = createContext<{ notify: (message: string, tone?: ToastTone) => void } | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const notify = useCallback(
    (message: string, tone: ToastTone = "success") => {
      if (!message) return;
      counter += 1;
      const id = counter;
      setItems((current) => [...current.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 6000 : 3500);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="print-hidden pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-5">
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex w-full max-w-sm animate-pop items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm shadow-float"
          >
            {item.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />}
            <p className="flex-1 leading-5 text-ink">{item.message}</p>
            <button type="button" onClick={() => dismiss(item.id)} className="text-faint hover:text-ink" aria-label={t("common.close")}>
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider.");
  return value.notify;
}
