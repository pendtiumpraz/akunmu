import type { Metadata } from "next";
import { requireStaffPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { PrivacySettingsPanel } from "./privacy-settings-panel";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("settings.tabPrivacy") };
}

/** The workspace's privacy officer (PPDP), default person in charge and retention periods. */
export default async function PrivacySettingsPage() {
  await requireStaffPage("settings.manage");
  return <PrivacySettingsPanel />;
}
