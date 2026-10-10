import { defaultLocaleSetting } from "../env";
import { BUILT_IN_DEFAULT_LOCALE, isLocale, type Locale } from "./locales";

/** Application default language: DEFAULT_LOCALE when valid, otherwise the built-in default. */
export function appDefaultLocale(): Locale {
  const configured = defaultLocaleSetting();
  return isLocale(configured) ? configured : BUILT_IN_DEFAULT_LOCALE;
}

/** A stored locale code if still supported, otherwise the app default. */
export function supportedLocaleOr(value: string | null | undefined): Locale {
  return isLocale(value) ? value : appDefaultLocale();
}
