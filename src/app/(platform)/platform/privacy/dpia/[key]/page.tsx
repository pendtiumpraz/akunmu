import type { Metadata } from "next";
import { requirePlatformPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { PLATFORM_AREA } from "../../../../../(app)/app/privacy/compliance/area";
import { DpiaEditor } from "../../../../../(app)/app/privacy/compliance/dpia-editor";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("privacyHub.dpiaTitle") };
}

/** One DPIA of the operator's own processing. */
export default async function PlatformDpiaPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ section?: string | string[] }> }) {
  const [, { key }, { section }] = await Promise.all([requirePlatformPage(), params, searchParams]);
  return <DpiaEditor area={PLATFORM_AREA} recordKey={decodeURIComponent(key)} initialSection={typeof section === "string" ? section : null} />;
}
