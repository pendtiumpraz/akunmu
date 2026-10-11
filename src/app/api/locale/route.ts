import { cookies } from "next/headers";
import { z } from "zod";
import { publicRoute } from "@/server/route";
import { secureCookies } from "@/shared/env";
import { readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";
import { isLocale } from "@/shared/i18n/locales";
import { LOCALE_COOKIE } from "@/shared/i18n/server";

const schema = z.object({ locale: z.string().refine(isLocale, { error: "validation.choice" }) });

export const POST = publicRoute(async ({ request, i18n }) => {
  const { locale } = parseWith(schema, await readJson(request));
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    secure: secureCookies(),
    maxAge: 365 * 86_400,
  });
  return ok({ locale }, i18n.t("api.localeChanged"));
});
