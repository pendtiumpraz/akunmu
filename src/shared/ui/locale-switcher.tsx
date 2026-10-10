"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { api } from "../http/client";
import { useI18n } from "../i18n/client";
import { LOCALES, type Locale } from "../i18n/locales";
import { cn } from "./cn";

/** Language picker built from the locale registry; new languages appear automatically. */
export function LocaleSwitcher({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const change = (next: Locale) => {
    startTransition(async () => {
      await api("/api/locale", { method: "POST", body: { locale: next } });
      router.refresh();
    });
  };

  return (
    <label
      className={cn(
        "relative inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium",
        tone === "dark" ? "text-white/90 hover:bg-white/10" : "text-ink-2 hover:bg-sunken",
        pending && "opacity-60",
        className,
      )}
    >
      <Globe className="size-4" aria-hidden="true" />
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(event) => change(event.target.value as Locale)}
        className="cursor-pointer appearance-none bg-transparent pr-1 outline-none"
      >
        {LOCALES.map((entry) => (
          <option key={entry.code} value={entry.code} className="text-ink">
            {entry.name}
          </option>
        ))}
      </select>
    </label>
  );
}
