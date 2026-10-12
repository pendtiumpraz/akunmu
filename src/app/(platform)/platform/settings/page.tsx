import type { Metadata } from "next";
import { requirePlatformPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { PlatformSettingsTabs } from "./platform-settings-tabs";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("platformSettings.title") };
}

/** The operator's identity, privacy officer, retention and data locations, as tabs. */
export default async function PlatformSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const [, { tab }] = await Promise.all([requirePlatformPage(), searchParams]);
  return <PlatformSettingsTabs initialTab={typeof tab === "string" ? tab : null} />;
}
