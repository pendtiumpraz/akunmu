import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaffPage } from "@/server/staff-page";
import { can } from "@/modules/users/permissions";
import { getI18n } from "@/shared/i18n/server";
import { WorkspaceSettings } from "./workspace-settings";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("settings.title") };
}

/** Workspace profile (admins). Everyone else lands on their own data. */
export default async function SettingsPage() {
  const staff = await requireStaffPage();
  if (!can(staff.user.role, "settings.manage")) redirect("/app/settings/data");
  return <WorkspaceSettings />;
}
