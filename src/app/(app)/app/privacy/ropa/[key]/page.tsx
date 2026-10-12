import type { Metadata } from "next";
import { requireStaffPage } from "@/server/staff-page";
import { can } from "@/modules/users/permissions";
import { getI18n } from "@/shared/i18n/server";
import { tenantArea } from "../../compliance/area";
import { RopaEditor } from "../../compliance/ropa-editor";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("privacyHub.ropaTitle") };
}

/** One record of processing activities of the workspace, edited section by section. */
export default async function RopaRecordPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ section?: string | string[] }> }) {
  const [staff, { key }, { section }] = await Promise.all([requireStaffPage("privacy.read"), params, searchParams]);
  return (
    <RopaEditor
      area={tenantArea(can(staff.user.role, "privacy.manage"))}
      recordKey={decodeURIComponent(key)}
      initialSection={typeof section === "string" ? section : null}
      profileHref="/app/settings/privacy"
    />
  );
}
