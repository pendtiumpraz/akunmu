import type { Metadata } from "next";
import { requireStaffPage } from "@/server/staff-page";
import { tenantById } from "@/modules/tenants/service";
import { can } from "@/modules/users/permissions";
import { inTenant } from "@/shared/db";
import { getI18n } from "@/shared/i18n/server";
import { MyData } from "./my-data";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("settings.tabData") };
}

/** Every user's own data: consent, a copy of their data, requests, and erasure. */
export default async function MyDataPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const [staff, { tab }] = await Promise.all([requireStaffPage(), searchParams]);
  const tenant = await inTenant(staff.tenantId, () => tenantById(staff.tenantId));
  return (
    <MyData
      email={staff.user.email}
      workspaceSlug={tenant?.slug ?? ""}
      isAdmin={can(staff.user.role, "settings.manage")}
      initialTab={typeof tab === "string" ? tab : null}
    />
  );
}
