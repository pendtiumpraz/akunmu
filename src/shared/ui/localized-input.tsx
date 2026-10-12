"use client";

import { useState } from "react";
import { useI18n } from "../i18n/client";
import { LOCALES } from "../i18n/locales";
import type { LocalizedText } from "../i18n/localized";
import { cn } from "./cn";
import { Input, Textarea } from "./form-controls";

/**
 * Editor for content stored per language ({ "id": "...", "en": "..." }).
 * One tab per registered locale, so adding a language adds an input here automatically.
 */
export function LocalizedInput({
  value,
  onChange,
  multiline,
  invalid,
  placeholder,
  id,
  maxLength,
}: {
  value: LocalizedText;
  onChange: (value: LocalizedText) => void;
  multiline?: boolean;
  invalid?: boolean;
  placeholder?: string;
  id?: string;
  maxLength?: number;
}) {
  const { locale } = useI18n();
  const [active, setActive] = useState<string>(LOCALES.some((entry) => entry.code === locale) ? locale : LOCALES[0].code);
  const current = value[active] ?? "";
  const update = (text: string) => onChange({ ...value, [active]: text });

  return (
    <div>
      <div className="mb-1.5 flex gap-1" role="tablist">
        {LOCALES.map((entry) => {
          const filled = Boolean(value[entry.code]?.trim());
          return (
            <button
              key={entry.code}
              type="button"
              role="tab"
              aria-selected={active === entry.code}
              onClick={() => setActive(entry.code)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                active === entry.code ? "bg-primary text-on-primary" : "bg-sunken text-muted hover:bg-line",
              )}
              title={entry.name}
            >
              {entry.code}
              {filled ? <span className={cn("size-1.5 rounded-full", active === entry.code ? "bg-surface" : "bg-ok")} /> : null}
            </button>
          );
        })}
      </div>
      {multiline ? (
        <Textarea id={id} value={current} onChange={(event) => update(event.target.value)} invalid={invalid} placeholder={placeholder} maxLength={maxLength} lang={active} />
      ) : (
        <Input id={id} value={current} onChange={(event) => update(event.target.value)} invalid={invalid} placeholder={placeholder} maxLength={maxLength} lang={active} />
      )}
    </div>
  );
}
