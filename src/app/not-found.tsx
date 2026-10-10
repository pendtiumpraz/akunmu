import { Compass } from "lucide-react";
import { getI18n } from "@/shared/i18n/server";
import { ButtonLink } from "@/shared/ui/button";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Compass className="size-7" />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-ink">{t("errorsPage.notFoundTitle")}</h1>
      <p className="mt-2 max-w-sm text-muted">{t("errorsPage.notFoundBody")}</p>
      <ButtonLink href="/" className="mt-6">
        {t("errorsPage.goHome")}
      </ButtonLink>
    </main>
  );
}
