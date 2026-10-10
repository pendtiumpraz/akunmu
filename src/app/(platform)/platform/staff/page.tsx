import type { Metadata } from "next";
import { requirePlatformPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { UsersManager } from "../../../(app)/app/settings/users/users-manager";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("platform.navStaff") };
}

/** People who run AkunMu itself (accounts without a tenant). */
export default async function PlatformStaffPage() {
  const staff = await requirePlatformPage();
  return <UsersManager apiBase="/api/platform/users" currentUserEmail={staff.user.email} />;
}
