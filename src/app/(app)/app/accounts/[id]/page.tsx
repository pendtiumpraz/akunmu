import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { AccountDetailView } from "./account-detail";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.accounts") };
}

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("map.read");
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  return <AccountDetailView accountId={Number(id)} />;
}
