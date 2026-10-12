import { z } from "zod";
import { LOCALE_CODES, SOURCE_LOCALE, type Locale } from "./locales";

/**
 * User-entered content in several languages, keyed by locale code: { "id": "...", "en": "..." }.
 * Stored as JSONB, so adding a language never needs a migration.
 */
export type LocalizedText = Partial<Record<string, string>>;

/** Returns the text in the requested locale, then the default and source locales, then any filled value. */
export function pickLocalized(
  text: LocalizedText | null | undefined,
  locale: Locale,
  defaultLocale: Locale = SOURCE_LOCALE,
): string {
  if (!text) return "";
  const ordered = [locale, defaultLocale, SOURCE_LOCALE, ...LOCALE_CODES];
  for (const code of ordered) {
    const value = text[code];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  const anyValue = Object.values(text).find((value) => typeof value === "string" && value.trim() !== "");
  return anyValue ?? "";
}

/** Drops unknown locales and blank values. */
export function cleanLocalized(text: LocalizedText | null | undefined): LocalizedText {
  const result: LocalizedText = {};
  if (!text) return result;
  for (const code of LOCALE_CODES) {
    const value = text[code];
    if (typeof value === "string" && value.trim() !== "") result[code] = value.trim();
  }
  return result;
}

/** Zod schema for localized text; `required` demands at least one non-empty language. */
export function localizedTextSchema(options: { required: boolean; max: number }) {
  return z
    .record(z.string(), z.string().max(options.max, { error: "validation.tooLong" }))
    .transform((value) => cleanLocalized(value))
    .refine((value) => !options.required || Object.keys(value).length > 0, {
      error: "validation.localizedRequired",
    });
}
