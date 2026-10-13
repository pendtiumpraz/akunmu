"use client";

import { Cherry, ExternalLink, Pencil, Plus, Search, Trash2, TreeDeciduous } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { ProjectView } from "@/modules/projects/types";
import { api } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/card";
import { cn } from "@/shared/ui/cn";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/shared/ui/feedback";
import { Menu } from "@/shared/ui/menu";
import { useToast } from "@/shared/ui/toast";
import { useApi } from "@/shared/ui/use-api";
import { useStaff } from "../app-shell";
import { ProjectDrawer } from "../drawers/project-drawer";
import type { TreeData } from "../map-types";
import { PlaceIcon } from "../sign-in-actions";
import { placeLabel } from "../ui";

type DrawerState = { project: ProjectView | null; sessionId: number | null } | null;

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** What the sessions work on, as cards with their screenshots; the same projects hang as fruit in the trees. */
export function ProjectsManager({ startSessionId }: { startSessionId: number | null }) {
  const { t } = useI18n();
  const { can } = useStaff();
  const notify = useToast();
  const canWrite = can("map.write");
  const list = useApi<ProjectView[]>("/api/projects");
  const tree = useApi<TreeData>("/api/tree");
  const [drawer, setDrawer] = useState<DrawerState>(startSessionId && canWrite ? { project: null, sessionId: startSessionId } : null);
  const [deleting, setDeleting] = useState<ProjectView | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  const sessions = tree.data?.signIns ?? [];
  const byId = new Map(sessions.map((row) => [row.id, row]));
  const needle = search.trim().toLowerCase();
  const projects = (list.data ?? []).filter(
    (project) =>
      !needle ||
      [project.name, project.url ?? "", project.notes ?? "", ...project.signInIds.map((id) => `${byId.get(id)?.account.identifier ?? ""} ${byId.get(id)?.device.name ?? ""}`)]
        .join(" ")
        .toLowerCase()
        .includes(needle),
  );

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const result = await api(`/api/projects/${deleting.id}`, { method: "DELETE" });
      notify(result.message);
      setDeleting(null);
      list.reload();
      tree.reload();
    } catch (error) {
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t("nav.projects")}
        description={t("projects.listHint")}
        actions={
          canWrite ? (
            <Button icon={<Plus className="size-4" />} onClick={() => setDrawer({ project: null, sessionId: null })}>
              {t("projects.addTitle")}
            </Button>
          ) : null
        }
      />
      <label className="relative mb-4 block max-w-sm">
        <span className="sr-only">{t("projects.search")}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("projects.search")}
          className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none placeholder:text-faint focus:ring-2 focus:ring-accent-line"
        />
      </label>

      {list.error && !list.data ? (
        <ErrorState title={t("common.loadFailed")} description={t("common.loadFailedHint")} retryLabel={t("common.retry")} onRetry={list.reload} />
      ) : !list.data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-80" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line-strong bg-surface">
          <EmptyState icon={<Cherry className="size-5" />} title={needle ? t("projects.noMatch") : t("projects.empty")} description={needle ? undefined : t("projects.emptyHint")} />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {projects.map((project) => {
            const linked = project.signInIds.map((id) => byId.get(id)).filter((row) => row !== undefined);
            const treeDevice = linked.find((row) => row.status === "signed_in")?.device.id;
            return (
              <article key={project.id} className="min-w-0 overflow-hidden rounded-panel border border-line bg-surface">
                <div className="relative aspect-[16/9] border-b border-line bg-sunken">
                  {project.screenshot ? (
                    <Image src={project.screenshot} alt={t("projects.screenshotOf", { name: project.name })} fill unoptimized sizes="(min-width: 1536px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover object-top" />
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-1.5 text-faint">
                      <Cherry className="size-7" />
                      <span className="text-xs">{t("projects.noScreenshot")}</span>
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <header className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-extrabold tracking-tight text-ink" title={project.name}>
                        {project.name}
                      </h2>
                      {project.url ? (
                        <a href={project.url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1 font-mono text-xs text-accent hover:underline">
                          <span className="truncate">{hostOf(project.url)}</span>
                          <ExternalLink className="size-3 shrink-0" />
                        </a>
                      ) : (
                        <p className="text-xs text-faint">{t("projects.noUrl")}</p>
                      )}
                    </div>
                    {canWrite ? (
                      <Menu
                        label={t("common.more")}
                        items={[
                          { label: t("common.edit"), icon: Pencil, onSelect: () => setDrawer({ project, sessionId: null }) },
                          { label: t("projects.deleteTitle"), icon: Trash2, tone: "danger", onSelect: () => setDeleting(project) },
                        ]}
                      />
                    ) : null}
                  </header>
                  {project.notes ? <p className="mt-2 line-clamp-2 text-[13px] text-ink-2">{project.notes}</p> : null}
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-faint">{t("projects.workedOnBy", { count: linked.length })}</p>
                  {linked.length === 0 ? (
                    <p className="mt-1 text-xs text-muted">{t("projects.noSessionsYet")}</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {linked.map((row) => (
                        <li key={row.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
                          <PlaceIcon row={row} />
                          <span className="min-w-0 flex-1">
                            <span className={cn("block truncate font-mono text-[12px] font-semibold text-ink", row.status !== "signed_in" && "line-through decoration-faint")}>
                              {row.account.identifier}
                            </span>
                            <span className="block truncate text-[11px] text-muted">{[row.device.name, placeLabel(row, t)].join(" · ")}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {treeDevice ? (
                    <Link href={`/app?tree=device-${treeDevice}`} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink">
                      <TreeDeciduous className="size-4" />
                      {t("projects.showInTree")}
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {drawer ? (
        <ProjectDrawer
          project={drawer.project}
          sessions={sessions}
          startSessionId={drawer.sessionId}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            list.reload();
            tree.reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={t("projects.deleteTitle")}
        description={deleting ? t("projects.deleteBody", { name: deleting.name }) : ""}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
