import type { Metadata } from "next";
import { requirePlatformPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { PlatformAi } from "./platform-ai";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("ai.providersTitle") };
}

/** AkunMu's own AI providers and the monthly AI quota of every workspace. */
export default async function PlatformAiPage() {
  await requirePlatformPage();
  return <PlatformAi />;
}
