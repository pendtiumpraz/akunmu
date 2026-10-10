"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { useI18n } from "@/shared/i18n/client";
import { Button } from "@/shared/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <AlertTriangle className="size-7" />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-ink">{t("errorsPage.errorTitle")}</h1>
      <p className="mt-2 max-w-sm text-muted">{t("errorsPage.errorBody")}</p>
      <Button className="mt-6" onClick={reset}>
        {t("errorsPage.tryAgain")}
      </Button>
    </main>
  );
}
