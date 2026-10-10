import { cookies, headers } from "next/headers";
import { appDefaultLocale } from "./default-locale";
import { isLocale, matchAcceptLanguage, type Locale } from "./locales";
import { i18nFor, type I18n } from "./messages-loader";

export const LOCALE_COOKIE = "pe_locale";

export { appDefaultLocale };

/** Language for the current request: cookie, then Accept-Language, then the app default. */
export async function resolveRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const headerStore = await headers();
  return matchAcceptLanguage(headerStore.get("accept-language")) ?? appDefaultLocale();
}

/** Translator, formatter and messages for the current request. */
export async function getI18n(): Promise<I18n> {
  return i18nFor(await resolveRequestLocale());
}
