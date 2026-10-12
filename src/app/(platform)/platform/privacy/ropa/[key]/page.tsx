import type { Metadata } from "next";
import { requirePlatformPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { PLATFORM_AREA } from "../../../../../(app)/app/privacy/compliance/area";
import { RopaEditor } from "../../../../../(app)/app/privacy/compliance/ropa-editor";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("privacyHub.ropaTitle") };
}

/** One record of the operator: as controller of its own activities, or as processor for workspaces. */
export default async function PlatformRopaPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ section?: string | string[] }> }) {
  const [, { key }, { section }] = await Promise.all([requirePlatformPage(), params, searchParams]);
  return <RopaEditor area={PLATFORM_AREA} recordKey={decodeURIComponent(key)} initialSection={typeof section === "string" ? section : null} profileHref="/platform/settings" />;
}
