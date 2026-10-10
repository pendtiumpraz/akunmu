/**
 * The single registry of supported languages.
 *
 * Adding a language takes two steps and no other code change:
 *   1. Copy `messages/en.json` to `messages/<code>.json` and translate the values.
 *   2. Add one entry to `LOCALES` below (code, native name, Intl tag, text direction, loader).
 *
 * Keys missing from a new language fall back to SOURCE_LOCALE, so a language can ship partially translated.
 * Text a person types (device names, notes) is stored as typed, in whatever language they use.
 */
export type TextDirection = "ltr" | "rtl";

export type LocaleDefinition = {
  code: string;
  /** Endonym shown in the language switcher. */
  name: string;
  /** BCP 47 tag used for Intl date, number and plural formatting. */
  intl: string;
  dir: TextDirection;
  load: () => Promise<{ default: unknown }>;
};

export const LOCALES = [
  { code: "id", name: "Bahasa Indonesia", intl: "id-ID", dir: "ltr", load: () => import("./messages/id.json") },
  { code: "en", name: "English", intl: "en-US", dir: "ltr", load: () => import("./messages/en.json") },
] as const satisfies readonly LocaleDefinition[];

export type Locale = (typeof LOCALES)[number]["code"];

export const LOCALE_CODES: readonly Locale[] = LOCALES.map((entry) => entry.code);

/** Reference language for message keys; every other language falls back to it. */
export const SOURCE_LOCALE: Locale = "en";

/** Used when neither the visitor nor DEFAULT_LOCALE picks a language. */
export const BUILT_IN_DEFAULT_LOCALE: Locale = "id";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALE_CODES as readonly string[]).includes(value);
}

export function localeDefinition(code: Locale): (typeof LOCALES)[number] {
  return LOCALES.find((entry) => entry.code === code) ?? LOCALES[0];
}

/** Picks the best supported locale from an Accept-Language header value. */
export function matchAcceptLanguage(header: string | null | undefined): Locale | undefined {
  if (!header) return undefined;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const quality = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: tag.toLowerCase(), q: quality ? Number(quality.slice(2)) || 0 : 1 };
    })
    .filter((entry) => entry.tag !== "" && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const exact = LOCALE_CODES.find((code) => code === tag);
    if (exact) return exact;
    const base = tag.split("-")[0];
    const partial = LOCALE_CODES.find((code) => code === base);
    if (partial) return partial;
  }
  return undefined;
}
