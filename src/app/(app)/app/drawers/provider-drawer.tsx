"use client";

import { useState } from "react";
import { api, firstFieldErrors } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Button } from "@/shared/ui/button";
import { Drawer } from "@/shared/ui/drawer";
import { Field, Input } from "@/shared/ui/form-controls";
import { useToast } from "@/shared/ui/toast";
import { ProviderAvatar } from "../ui";

export type ProviderDraft = { id?: number; name: string; domain: string | null; color: string };

const EMPTY: ProviderDraft = { name: "", domain: null, color: "#64748b" };

/** Add a provider of the workspace's own, or edit one. Render it only while open. */
export function ProviderDrawer({ provider, onClose, onSaved }: { provider: ProviderDraft | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const notify = useToast();
  const [draft, setDraft] = useState<ProviderDraft>(provider ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <Key extends keyof ProviderDraft>(key: Key, value: ProviderDraft[Key]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const body = { name: draft.name, domain: draft.domain ?? "", color: draft.color };
      const result = provider?.id ? await api(`/api/providers/${provider.id}`, { method: "PATCH", body }) : await api("/api/providers", { method: "POST", body });
      notify(result.message);
      onSaved();
    } catch (error) {
      setErrors(firstFieldErrors(error));
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={provider?.id ? t("providers.editTitle") : t("providers.addTitle")}
      description={t("providers.drawerHint")}
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
        <div className="flex items-center gap-3 rounded-xl border border-line bg-subtle p-3">
          <ProviderAvatar provider={{ name: draft.name || "?", color: draft.color }} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{draft.name || t("providers.previewName")}</p>
            <p className="truncate font-mono text-xs text-muted">{draft.domain || "—"}</p>
          </div>
        </div>
        <Field label={t("providers.fieldName")} htmlFor="provider-name" required error={errors.name}>
          <Input id="provider-name" value={draft.name} maxLength={60} onChange={(event) => set("name", event.target.value)} invalid={Boolean(errors.name)} autoComplete="off" />
        </Field>
        <Field label={t("providers.fieldDomain")} htmlFor="provider-domain" optionalLabel={t("common.optional")} error={errors.domain} hint={t("providers.domainHint")}>
          <Input
            id="provider-domain"
            value={draft.domain ?? ""}
            maxLength={120}
            onChange={(event) => set("domain", event.target.value)}
            invalid={Boolean(errors.domain)}
            spellCheck={false}
            className="font-mono text-[13px]"
          />
        </Field>
        <Field label={t("providers.fieldColor")} htmlFor="provider-color" error={errors.color}>
          <div className="flex items-center gap-2">
            <input
              id="provider-color"
              type="color"
              value={draft.color}
              onChange={(event) => set("color", event.target.value)}
              className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-surface p-1"
            />
            <Input value={draft.color} maxLength={7} onChange={(event) => set("color", event.target.value)} className="w-28 font-mono text-[13px]" aria-label={t("providers.fieldColor")} />
          </div>
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Drawer>
  );
}
