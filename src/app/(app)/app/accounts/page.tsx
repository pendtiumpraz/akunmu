import type { Metadata } from "next";
import { requireStaffPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { AccountsManager } from "./accounts-manager";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.accounts") };
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage("map.read");
  const { provider } = await searchParams;
  return <AccountsManager initialProvider={typeof provider === "string" && /^\d{1,12}$/.test(provider) ? provider : ""} />;
}
