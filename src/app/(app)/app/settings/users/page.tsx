import type { Metadata } from "next";
import { requireStaffPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { UsersManager } from "./users-manager";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("users.title") };
}

export default async function UsersPage() {
  const staff = await requireStaffPage("users.manage");
  return <UsersManager currentUserEmail={staff.user.email} header={false} />;
}
