import en from "./locales/en.json";
import id from "./locales/id.json";

/** The shell's own words (dialogs, menu, the starting screen), in the app's two languages. */
export type Messages = typeof en;
export type Language = "id" | "en";

const MESSAGES: Record<Language, Messages> = { en, id };

/**
 * Indonesian when the system speaks it or is set to Indonesia (an English Windows with the region "en-ID" counts),
 * English otherwise. The app's own language switch still wins.
 */
export function languageFor(locales: string[], countryCode = ""): Language {
  const indonesian = countryCode.trim().toUpperCase() === "ID" || locales.some((locale) => /^id\b|[-_]id$/i.test(locale.trim()));
  return indonesian ? "id" : "en";
}

export function messagesFor(language: Language): Messages {
  return MESSAGES[language];
}

/** Fills {placeholders} in a message. */
export function format(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match: string, key: string) => values[key] ?? match);
}
