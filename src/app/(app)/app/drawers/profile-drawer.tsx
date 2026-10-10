"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { BROWSERS, PROFILE_COLORS, type Browser } from "@/modules/devices/types";
import { api, firstFieldErrors, type Paginated } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Drawer } from "@/shared/ui/drawer";
import { Field, Input, Select, Textarea } from "@/shared/ui/form-controls";
import { useToast } from "@/shared/ui/toast";
import { useApi } from "@/shared/ui/use-api";
import type { AccountListItem } from "../map-types";
import { BrowserMark, browserLabel } from "../ui";

export type ProfileDraft = { id?: number; browser: Browser; name: string; color: string | null; syncAccountId: number | null; notes: string | null };

const EMPTY: ProfileDraft = { browser: "chrome", name: "", color: null, syncAccountId: null, notes: null };

/** Add or edit a browser profile of a device. Render it only while open. */
export function ProfileDrawer({
  deviceId,
  deviceName,
  profile,
  onClose,
  onSaved,
}: {
  deviceId: number;
  deviceName: string;
  profile: ProfileDraft | null;
  onClose: () => void;
  onSaved: (profile: { id: number; name: string }) => void;
}) {
  const { t } = useI18n();
  const notify = useToast();
  const [draft, setDraft] = useState<ProfileDraft>(profile ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const accounts = useApi<Paginated<AccountListItem>>("/api/accounts?per_page=100");

  const set = <Key extends keyof ProfileDraft>(key: Key, value: ProfileDraft[Key]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const body = { browser: draft.browser, name: draft.name, color: draft.color ?? "", syncAccountId: draft.syncAccountId, notes: draft.notes ?? "" };
      const result = profile?.id
        ? await api<{ id: number; name: string }>(`/api/profiles/${profile.id}`, { method: "PATCH", body })
        : await api<{ id: number; name: string }>(`/api/devices/${deviceId}/profiles`, { method: "POST", body });
      notify(result.message);
      onSaved(result.data);
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
      title={profile?.id ? t("profiles.editTitle") : t("profiles.addTitle")}
      description={t("profiles.drawerHint", { device: deviceName })}
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
        <Field label={t("profiles.fieldBrowser")} error={errors.browser}>
          <div role="radiogroup" aria-label={t("profiles.fieldBrowser")} className="grid grid-cols-4 gap-1.5">
            {BROWSERS.map((browser) => (
              <button
                key={browser}
                type="button"
                role="radio"
                aria-checked={draft.browser === browser}
                onClick={() => set("browser", browser)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-semibold transition-colors",
                  draft.browser === browser ? "border-accent bg-accent-soft text-ink" : "border-line text-muted hover:bg-subtle hover:text-ink",
                )}
              >
                <BrowserMark browser={browser} />
                <span className="max-w-full truncate">{browserLabel(browser, t)}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("profiles.fieldName")} htmlFor="profile-name" required error={errors.name} hint={t("profiles.nameHint")}>
          <Input id="profile-name" value={draft.name} maxLength={60} onChange={(event) => set("name", event.target.value)} invalid={Boolean(errors.name)} autoComplete="off" />
        </Field>
        <Field label={t("profiles.fieldColor")} error={errors.color} optionalLabel={t("common.optional")}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => set("color", null)}
              aria-pressed={draft.color === null}
              aria-label={t("profiles.noColor")}
              title={t("profiles.noColor")}
              className={cn("size-7 rounded-full border border-dashed border-line-strong", draft.color === null && "ring-2 ring-accent ring-offset-2 ring-offset-surface")}
            />
            {PROFILE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => set("color", color)}
                aria-pressed={draft.color === color}
                aria-label={color}
                className={cn("inline-flex size-7 items-center justify-center rounded-full text-white", draft.color === color && "ring-2 ring-accent ring-offset-2 ring-offset-surface")}
                style={{ backgroundColor: color }}
              >
                {draft.color === color ? <Check className="size-3.5" /> : null}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("profiles.fieldSync")} htmlFor="profile-sync" optionalLabel={t("common.optional")} error={errors.syncAccountId} hint={t("profiles.syncHint")}>
          <Select id="profile-sync" value={draft.syncAccountId ?? ""} onChange={(event) => set("syncAccountId", event.target.value ? Number(event.target.value) : null)}>
            <option value="">{t("profiles.syncNone")}</option>
            {(accounts.data?.items ?? []).map((account) => (
              <option key={account.id} value={account.id}>
                {account.provider.name} · {account.identifier}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("profiles.fieldNotes")} htmlFor="profile-notes" optionalLabel={t("common.optional")} error={errors.notes} hint={t("common.noSecretsHint")}>
          <Textarea id="profile-notes" value={draft.notes ?? ""} maxLength={1000} onChange={(event) => set("notes", event.target.value)} />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Drawer>
  );
}
