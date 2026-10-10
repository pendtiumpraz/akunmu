import type { Metadata } from "next";
import { requireStaffPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { Assistant } from "./assistant";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("ai.title") };
}

/** The AI assistant; every staff role can use it, with the tools its permissions allow. */
export default async function AssistantPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage();
  const params = await searchParams;
  const raw = Array.isArray(params.c) ? params.c[0] : params.c;
  const question = typeof params.q === "string" ? params.q.slice(0, 500) : "";
  return <Assistant initialConversationId={raw && /^\d{1,12}$/.test(raw) ? Number(raw) : null} initialQuestion={question} />;
}
