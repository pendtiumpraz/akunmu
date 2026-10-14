"use client";

import { Cherry, ImagePlus, Search, Trash2 } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { MAX_SCREENSHOT_BYTES, SCREENSHOT_ACCEPT, type ProjectView } from "@/modules/projects/types";
import { api, firstFieldErrors } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Drawer } from "@/shared/ui/drawer";
import { Field, Input, Textarea } from "@/shared/ui/form-controls";
import { useToast } from "@/shared/ui/toast";
import type { TreeData } from "../map-types";
import { PlaceIcon } from "../sign-in-actions";
import { placeLabel } from "../ui";

type Session = TreeData["signIns"][number];
type Draft = { name: string; url: string; notes: string; signInIds: number[] };

/**
 * Add or edit a project: its name, site and notes, the login sessions working on it, and its screenshot (stored in
 * Vercel Blob, shown as fruit in the trees). Render it only while open.
 */
export function ProjectDrawer({
  project,
  sessions,
  startSessionId,
  onClose,
  onSaved,
}: {
  project: ProjectView | null;
  /** Every recorded session (signed out ones only show when already linked). */
  sessions: Session[];
  startSessionId?: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const notify = useToast();
  const [draft, setDraft] = useState<Draft>(() => ({
    name: project?.name ?? "",
    url: project?.url ?? "",
    notes: project?.notes ?? "",
    signInIds: project?.signInIds ?? (startSessionId ? [startSessionId] : []),
  }));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dropScreenshot, setDropScreenshot] = useState(false);
  const [needle, setNeedle] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setDraft((current) => ({ ...current, [key]: value }));
  const toggle = (id: number) => set("signInIds", draft.signInIds.includes(id) ? draft.signInIds.filter((other) => other !== id) : [...draft.signInIds, id]);

  // Active sessions (and linked signed-out ones), by device then place; the search narrows them.
  const groups = useMemo(() => {
    const words = needle.trim().toLowerCase();
    const shown = sessions.filter((row) => row.status === "signed_in" || draft.signInIds.includes(row.id));
    const matching = shown.filter((row) => !words || [row.account.identifier, row.device.name, placeLabel(row, t), row.provider.name].join(" ").toLowerCase().includes(words));
    const byDevice = new Map<number, { name: string; rows: Session[] }>();
    for (const row of matching) byDevice.set(row.device.id, { name: row.device.name, rows: [...(byDevice.get(row.device.id)?.rows ?? []), row] });
    return [...byDevice.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions, draft.signInIds, needle, t]);

  const pick = (chosen: File | null) => {
    setErrors((current) => ({ ...current, screenshot: "" }));
    if (chosen && chosen.size > MAX_SCREENSHOT_BYTES) {
      setErrors((current) => ({ ...current, screenshot: t("validation.imageTooLarge") }));
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(chosen);
    setPreview(chosen ? URL.createObjectURL(chosen) : null);
    if (chosen) setDropScreenshot(false);
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const body = { name: draft.name, url: draft.url, notes: draft.notes, signInIds: draft.signInIds };
      const result = project
        ? await api<ProjectView>(`/api/projects/${project.id}`, { method: "PATCH", body })
        : await api<ProjectView>("/api/projects", { method: "POST", body });
      if (file) {
        const form = new FormData();
        form.append("file", file);
        await api(`/api/projects/${result.data.id}/screenshot`, { method: "POST", formData: form });
      } else if (dropScreenshot && project?.screenshot) {
        await api(`/api/projects/${result.data.id}/screenshot`, { method: "DELETE" });
      }
      notify(result.message || t("common.saved"));
      onSaved();
    } catch (error) {
      setErrors(firstFieldErrors(error));
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const shownImage = preview ?? (dropScreenshot ? null : (project?.screenshot ?? null));

  return (
    <Drawer
      open
      onClose={onClose}
      title={project ? t("projects.editTitle") : t("projects.addTitle")}
      description={t("projects.drawerHint")}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label={t("projects.fieldName")} htmlFor="project-name" required error={errors.name}>
          <Input id="project-name" value={draft.name} maxLength={120} onChange={(event) => set("name", event.target.value)} invalid={Boolean(errors.name)} autoComplete="off" />
        </Field>
        <Field label={t("projects.fieldUrl")} htmlFor="project-url" optionalLabel={t("common.optional")} error={errors.url} hint={t("projects.urlHint")}>
          <Input
            id="project-url"
            value={draft.url}
            maxLength={500}
            onChange={(event) => set("url", event.target.value)}
            invalid={Boolean(errors.url)}
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
            placeholder={t("projects.urlPlaceholder")}
            className="font-mono"
          />
        </Field>

        <Field label={t("projects.fieldScreenshot")} optionalLabel={t("common.optional")} error={errors.screenshot} hint={t("projects.screenshotHint")}>
          <div className="space-y-2">
            <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-line bg-sunken">
              {shownImage ? (
                <Image src={shownImage} alt={t("projects.screenshotOf", { name: draft.name || "…" })} fill unoptimized className="object-cover object-top" />
              ) : (
                <span className="flex size-full flex-col items-center justify-center gap-1.5 text-faint">
                  <Cherry className="size-6" />
                  <span className="text-xs">{t("projects.noScreenshot")}</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-semibold text-ink-2 hover:bg-subtle">
                <ImagePlus className="size-4" />
                {shownImage ? t("projects.replaceScreenshot") : t("projects.uploadScreenshot")}
                <input type="file" accept={SCREENSHOT_ACCEPT} className="sr-only" onChange={(event) => pick(event.target.files?.[0] ?? null)} />
              </label>
              {shownImage ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="size-4" />}
                  onClick={() => {
                    pick(null);
                    setDropScreenshot(Boolean(project?.screenshot));
                  }}
                >
                  {t("projects.removeScreenshot")}
                </Button>
              ) : null}
            </div>
          </div>
        </Field>

        <Field label={t("projects.fieldSessions")} error={errors.signInIds} hint={t("projects.sessionsHint")}>
          <div className="rounded-xl border border-line">
            <label className="relative block border-b border-line">
              <span className="sr-only">{t("projects.searchSessions")}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <input
                value={needle}
                onChange={(event) => setNeedle(event.target.value)}
                placeholder={t("projects.searchSessions")}
                className="h-9 w-full rounded-t-xl bg-transparent pl-8 pr-3 text-[13px] text-ink outline-none placeholder:text-faint"
              />
            </label>
            <div className="max-h-72 space-y-2 overflow-y-auto p-2">
              {groups.length === 0 ? <p className="px-1 py-2 text-xs text-muted">{t("projects.noSessions")}</p> : null}
              {groups.map((group) => (
                <div key={group.name}>
                  <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-faint">{group.name}</p>
                  {group.rows.map((row) => {
                    const checked = draft.signInIds.includes(row.id);
                    return (
                      <label key={row.id} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-subtle", checked && "bg-accent-soft hover:bg-accent-soft")}>
                        <input type="checkbox" checked={checked} onChange={() => toggle(row.id)} className="size-4 shrink-0 cursor-pointer rounded accent-primary" />
                        <PlaceIcon row={row} />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate font-mono text-[12px] font-semibold text-ink", row.status !== "signed_in" && "line-through decoration-faint")}>
                            {row.account.identifier}
                          </span>
                          <span className="block truncate text-[11px] text-muted">{[row.provider.name, placeLabel(row, t)].join(" · ")}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </Field>

        <Field label={t("projects.fieldNotes")} htmlFor="project-notes" optionalLabel={t("common.optional")} error={errors.notes} hint={t("common.noSecretsHint")}>
          <Textarea id="project-notes" value={draft.notes} maxLength={1000} onChange={(event) => set("notes", event.target.value)} />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Drawer>
  );
}
