import type { Metadata } from "next";
import { requireStaffPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { ProjectsManager } from "./projects-manager";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.projects") };
}

/** Projects; `?session=<id>` opens the form for a new project of that session (from the trees). */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage("map.read");
  const params = await searchParams;
  const session = typeof params.session === "string" && /^\d{1,12}$/.test(params.session) ? Number(params.session) : null;
  return <ProjectsManager startSessionId={session} />;
}
