import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireStaffPage } from "@/server/staff-page";
import { tenantById } from "@/modules/tenants/service";
import { PERMISSIONS, can, type Permission } from "@/modules/users/permissions";
import { getI18n } from "@/shared/i18n/server";
import { APP_NAME } from "@/shared/ui/logo";
import { AppShell } from "./app-shell";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { default: t("nav.map"), template: `%s · ${APP_NAME}` }, robots: { index: false } };
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaffPage();
  const tenant = await tenantById(staff.tenantId);
  const permissions = (Object.keys(PERMISSIONS) as Permission[]).filter((permission) => can(staff.user.role, permission));
  return (
    <AppShell user={{ name: staff.user.name, email: staff.user.email, role: staff.user.role }} permissions={permissions} caption={tenant?.name}>
      {children}
    </AppShell>
  );
}
