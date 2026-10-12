import type { Metadata } from "next";
import { requirePlatformPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { PLATFORM_AREA } from "../../../(app)/app/privacy/compliance/area";
import { PrivacyHub } from "../../../(app)/app/privacy/compliance/hub";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("privacyHub.platformTitle") };
}

/** The operator's own register: activities as controller, processor records, DPIAs, requests and incidents. */
export default async function PlatformPrivacyPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const [, { tab }] = await Promise.all([requirePlatformPage(), searchParams]);
  return <PrivacyHub area={PLATFORM_AREA} initialTab={typeof tab === "string" ? tab : null} settingsHref="/platform/settings" />;
}
