"use client";

import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/shared/i18n/client";
import { LOCALES } from "@/shared/i18n/locales";
import { cn } from "@/shared/ui/cn";

export type { ComplianceArea } from "./area";

/**
 * PDF and Word downloads of one document, with the document language (defaults to the screen language).
 * Plain links: the browser downloads the file the API renders.
 */
export function DocumentDownloads({ href, compact }: { href: string; compact?: boolean }) {
  const { t, locale } = useI18n();
  const [language, setLanguage] = useState<string>(locale);
  const link = (format: "pdf" | "docx") => `${href}${href.includes("?") ? "&" : "?"}format=${format}&lang=${language}`;
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-card", compact && "p-0.5")}>
      <label className="sr-only" htmlFor={`lang-${href}`}>
        {t("privacyHub.documentLanguage")}
      </label>
      <select
        id={`lang-${href}`}
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        className="h-8 rounded-lg bg-transparent px-1.5 text-xs font-semibold uppercase text-muted outline-none hover:bg-subtle"
        title={t("privacyHub.documentLanguage")}
      >
        {LOCALES.map((entry) => (
          <option key={entry.code} value={entry.code}>
            {entry.code}
          </option>
        ))}
      </select>
      <a href={link("pdf")} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-danger-ink hover:bg-danger-soft" download>
        <FileText className="size-3.5" />
        PDF
      </a>
      <a href={link("docx")} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-accent hover:bg-accent-soft" download>
        <Download className="size-3.5" />
        DOCX
      </a>
    </div>
  );
}

/** Small colored badge for risk levels (low / medium / high), shared by lists and editors. */
export function RiskPill({ level }: { level: "low" | "medium" | "high" | null }) {
  const { t } = useI18n();
  if (!level) return <span className="text-xs text-muted">{t("common.none")}</span>;
  const tone = { low: "bg-ok-soft text-ok-ink ring-ok-line", medium: "bg-warn-soft text-warn-ink ring-warn-line", high: "bg-danger-soft text-danger-ink ring-danger-line" }[level];
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1", tone)}>{t.dynamic(`compliance.overall.${level}`)}</span>;
}

/** Hours until a deadline as a short label ("12 h left" / "3 h overdue"); `now` comes from useNow(). */
export function DeadlineLabel({ deadline, done, now }: { deadline: string | null; done: boolean; now: number | null }) {
  const { t } = useI18n();
  if (!deadline || done || now === null) return <span className="text-xs text-muted">{t("common.none")}</span>;
  const hours = Math.floor((new Date(deadline).getTime() - now) / 3_600_000);
  if (hours < 0) return <span className="text-xs font-semibold text-danger-ink">{t("privacyHub.overdueHours", { hours: Math.abs(hours) })}</span>;
  return <span className={cn("text-xs font-semibold", hours <= 24 ? "text-warn-ink" : "text-muted")}>{t("privacyHub.hoursLeft", { hours })}</span>;
}
