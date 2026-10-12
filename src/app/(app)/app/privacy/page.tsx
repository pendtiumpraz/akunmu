import type { Metadata } from "next";
import { requireStaffPage } from "@/server/staff-page";
import { can } from "@/modules/users/permissions";
import { getI18n } from "@/shared/i18n/server";
import { tenantArea } from "./compliance/area";
import { PrivacyHub } from "./compliance/hub";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("privacyHub.title") };
}

/** The workspace's privacy records: RoPA, DPIAs, data subject requests and incidents. */
export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const [staff, { tab }] = await Promise.all([requireStaffPage("privacy.read"), searchParams]);
  return <PrivacyHub area={tenantArea(can(staff.user.role, "privacy.manage"))} initialTab={typeof tab === "string" ? tab : null} settingsHref="/app/settings/privacy" />;
}
