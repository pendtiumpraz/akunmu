"use client";

import { useI18n } from "@/shared/i18n/client";
import { PrivacySettings } from "./privacy-settings";

/** Client wrapper: the server page cannot pass translated titles without loading the client translator. */
export function PrivacySettingsPanel() {
  const { t } = useI18n();
  return <PrivacySettings endpoint="/api/settings/privacy" blocks={["officer", "pic", "retentionTenant"]} title={t("settings.privacy.title")} subtitle={t("settings.privacy.subtitle")} />;
}
