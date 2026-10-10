"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../i18n/client";
import { cn } from "./cn";

export function CopyButton({ value, className, label }: { value: string; className?: string; label?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-ink-2 hover:bg-subtle",
        className,
      )}
    >
      {copied ? <Check className="size-3.5 text-ok-ink" /> : <Copy className="size-3.5" />}
      {copied ? t("common.copied") : (label ?? t("common.copy"))}
    </button>
  );
}
