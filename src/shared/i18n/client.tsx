"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createFormatter, type Formatter } from "./format";
import { localeDefinition, type Locale } from "./locales";
import { createTranslator, type MessageTree, type Translator } from "./translate";

type I18nContextValue = {
  locale: Locale;
  defaultLocale: Locale;
  t: Translator;
  format: Formatter;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  defaultLocale,
  messages,
  children,
}: {
  locale: Locale;
  defaultLocale: Locale;
  messages: MessageTree;
  children: ReactNode;
}) {
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      defaultLocale,
      t: createTranslator(messages, localeDefinition(locale).intl),
      format: createFormatter(locale),
    }),
    [locale, defaultLocale, messages],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider.");
  return value;
}
