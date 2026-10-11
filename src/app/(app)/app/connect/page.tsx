import type { Metadata } from "next";
import { DOWNLOADS } from "@/modules/connect/downloads";
import { requireStaffPage } from "@/server/staff-page";
import { desktopAgentAddress, isDesktop } from "@/shared/env";
import { getI18n } from "@/shared/i18n/server";
import { ConnectManager } from "./connect-manager";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("connect.title") };
}

/** Download & connect: AkunMu Desktop and the browser extension, the extension's keys, and what they found. */
export default async function ConnectPage() {
  await requireStaffPage("map.read");
  return <ConnectManager desktop={isDesktop()} agentAddress={desktopAgentAddress()} downloads={DOWNLOADS} />;
}
