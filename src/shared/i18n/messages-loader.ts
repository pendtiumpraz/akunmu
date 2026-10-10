import { localeDefinition, SOURCE_LOCALE, type Locale } from "./locales";
import { createFormatter, type Formatter } from "./format";
import { createTranslator, mergeMessages, type MessageTree, type Translator } from "./translate";

const cache = new Map<Locale, Promise<MessageTree>>();

async function loadRaw(locale: Locale): Promise<MessageTree> {
  const loaded = await localeDefinition(locale).load();
  return loaded.default as MessageTree;
}

/** Messages for a locale with missing keys filled from SOURCE_LOCALE. Cached per process. */
export function loadMessages(locale: Locale): Promise<MessageTree> {
  let pending = cache.get(locale);
  if (!pending) {
    pending =
      locale === SOURCE_LOCALE
        ? loadRaw(locale)
        : Promise.all([loadRaw(SOURCE_LOCALE), loadRaw(locale)]).then(([source, own]) => mergeMessages(source, own));
    cache.set(locale, pending);
  }
  return pending;
}

export type I18n = {
  locale: Locale;
  messages: MessageTree;
  t: Translator;
  format: Formatter;
};

/** Translator for an explicit locale; usable outside requests (emails, cron jobs, scripts). */
export async function i18nFor(locale: Locale): Promise<I18n> {
  const messages = await loadMessages(locale);
  return {
    locale,
    messages,
    t: createTranslator(messages, localeDefinition(locale).intl),
    format: createFormatter(locale),
  };
}
