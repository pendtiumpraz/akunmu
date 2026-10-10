import type { Metadata } from "next";
import { requireStaffPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { ProvidersManager } from "./providers-manager";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.providers") };
}

export default async function ProvidersPage() {
  await requireStaffPage("map.read");
  return <ProvidersManager />;
}
