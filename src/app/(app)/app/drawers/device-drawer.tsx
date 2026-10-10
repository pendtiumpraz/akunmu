"use client";

import { useState } from "react";
import { DEVICE_KINDS, DEVICE_SYSTEMS, type DeviceKind, type DeviceSystem } from "@/modules/devices/types";
import { api, firstFieldErrors } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Button } from "@/shared/ui/button";
import { Drawer } from "@/shared/ui/drawer";
import { Field, Input, Select, Textarea } from "@/shared/ui/form-controls";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/ui/cn";
import { DeviceIcon, kindLabel, systemLabel } from "../ui";

export type DeviceDraft = { id?: number; name: string; kind: DeviceKind; system: DeviceSystem; location: string | null; notes: string | null };

const EMPTY: DeviceDraft = { name: "", kind: "laptop", system: "windows", location: null, notes: null };

/** Add or edit a device (right-side drawer). Render it only while open, so the form starts from `device`. */
export function DeviceDrawer({
  device,
  onClose,
  onSaved,
}: {
  device: DeviceDraft | null;
  onClose: () => void;
  onSaved: (device: { id: number; name: string }) => void;
}) {
  const { t } = useI18n();
  const notify = useToast();
  const [draft, setDraft] = useState<DeviceDraft>(device ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <Key extends keyof DeviceDraft>(key: Key, value: DeviceDraft[Key]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const body = { name: draft.name, kind: draft.kind, system: draft.system, location: draft.location ?? "", notes: draft.notes ?? "" };
      const result = device?.id
        ? await api<{ id: number; name: string }>(`/api/devices/${device.id}`, { method: "PATCH", body })
        : await api<{ id: number; name: string }>("/api/devices", { method: "POST", body });
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
      title={device?.id ? t("devices.editTitle") : t("devices.addTitle")}
      description={t("devices.drawerHint")}
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
        <Field label={t("devices.fieldName")} htmlFor="device-name" required error={errors.name} hint={t("devices.nameHint")}>
          <Input id="device-name" value={draft.name} maxLength={80} onChange={(event) => set("name", event.target.value)} invalid={Boolean(errors.name)} autoComplete="off" />
        </Field>
        <Field label={t("devices.fieldKind")} error={errors.kind}>
          <div role="radiogroup" aria-label={t("devices.fieldKind")} className="grid grid-cols-5 gap-1.5">
            {DEVICE_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={draft.kind === kind}
                onClick={() => set("kind", kind)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-semibold transition-colors",
                  draft.kind === kind ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-subtle hover:text-ink",
                )}
              >
                <DeviceIcon kind={kind} className="size-5" />
                <span className="max-w-full truncate">{kindLabel(kind, t)}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("devices.fieldSystem")} htmlFor="device-system" error={errors.system}>
          <Select id="device-system" value={draft.system} onChange={(event) => set("system", event.target.value as DeviceSystem)}>
            {DEVICE_SYSTEMS.map((system) => (
              <option key={system} value={system}>
                {systemLabel(system, t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("devices.fieldLocation")} htmlFor="device-location" optionalLabel={t("common.optional")} error={errors.location} hint={t("devices.locationHint")}>
          <Input id="device-location" value={draft.location ?? ""} maxLength={80} onChange={(event) => set("location", event.target.value)} />
        </Field>
        <Field label={t("devices.fieldNotes")} htmlFor="device-notes" optionalLabel={t("common.optional")} error={errors.notes} hint={t("common.noSecretsHint")}>
          <Textarea id="device-notes" value={draft.notes ?? ""} maxLength={1000} onChange={(event) => set("notes", event.target.value)} />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Drawer>
  );
}
