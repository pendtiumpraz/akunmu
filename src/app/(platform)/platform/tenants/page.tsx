import type { Metadata } from "next";
import { requirePlatformPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { TenantsManager } from "./tenants-manager";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("platform.tenantsTitle") };
}

export default async function PlatformTenantsPage() {
  await requirePlatformPage();
  return <TenantsManager />;
}
