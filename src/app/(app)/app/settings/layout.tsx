import type { ReactNode } from "react";
import { getI18n } from "@/shared/i18n/server";
import { PageHeader } from "@/shared/ui/card";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />
      <SettingsTabs />
      <div className="mt-5">{children}</div>
    </>
  );
}
