import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requirePlatformPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { PlatformShell } from "./platform-shell";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { default: t("platform.overviewTitle"), template: `%s · ${t("platform.consoleCaption")}` }, robots: { index: false } };
}

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const staff = await requirePlatformPage();
  return <PlatformShell user={{ name: staff.user.name, email: staff.user.email, role: staff.user.role }}>{children}</PlatformShell>;
}
