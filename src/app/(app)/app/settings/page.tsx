import type { Metadata } from "next";
import { requireStaffPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { AiSettings } from "./ai-settings";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("settings.title") };
}

/** Workspace settings: the assistant's AI (platform AI or the workspace's own keys). */
export default async function SettingsPage() {
  await requireStaffPage("settings.manage");
  return <AiSettings />;
}
