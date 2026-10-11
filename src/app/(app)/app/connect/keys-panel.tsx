"use client";

import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, firstFieldErrors } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Button, IconButton } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { CopyButton } from "@/shared/ui/copy-button";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/shared/ui/feedback";
import { Field, Input, Select } from "@/shared/ui/form-controls";
import { useToast } from "@/shared/ui/toast";
import { useApi } from "@/shared/ui/use-api";
import type { DeviceListItem, IngestKeyItem } from "../map-types";
import { browserLabel } from "../ui";

type Created = IngestKeyItem & { token: string };

/** A value to copy into the extension, on one line. */
function CopyLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-faint">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-[13px] text-ink">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

/**
 * The browser extension's keys: one per device, shown once when made (only its last characters are kept in view),
 * with the address to paste next to it; revoking one stops that extension from reporting.
 */
export function KeysPanel({ address }: { address: string | null }) {
  const { t, format } = useI18n();
  const notify = useToast();
  const keys = useApi<IngestKeyItem[]>("/api/connect/tokens");
  const devices = useApi<DeviceListItem[]>("/api/devices");
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [revoking, setRevoking] = useState<IngestKeyItem | null>(null);
  const [busy, setBusy] = useState(false);

  const deviceList = devices.data ?? [];
  const chosen = deviceId ?? deviceList[0]?.id ?? null;

  const create = async () => {
    if (chosen === null) return;
    setSaving(true);
    setErrors({});
    try {
      const fallback = deviceList.find((device) => device.id === chosen)?.name ?? "";
      const result = await api<Created>("/api/connect/tokens", { method: "POST", body: { deviceId: chosen, name: name.trim() || fallback } });
      setCreated(result.data);
      setName("");
      keys.reload();
    } catch (error) {
      setErrors(firstFieldErrors(error));
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      const result = await api(`/api/connect/tokens/${revoking.id}`, { method: "DELETE" });
      notify(result.message);
      setRevoking(null);
      if (created?.id === revoking.id) setCreated(null);
      keys.reload();
    } catch (error) {
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t("connect.keysTitle")} description={t("connect.keysHint")} />
      <div className="space-y-4 p-4">
        {devices.data && deviceList.length === 0 ? (
          <p className="text-[13px] text-muted">{t("connect.noDevices")}</p>
        ) : (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <Field label={t("connect.keyDevice")} htmlFor="key-device" error={errors.deviceId}>
              <Select id="key-device" value={chosen ?? ""} onChange={(event) => setDeviceId(Number(event.target.value))} disabled={!devices.data}>
                {deviceList.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("connect.keyName")} htmlFor="key-name" optionalLabel={t("common.optional")} error={errors.name}>
              <Input id="key-name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder={t("connect.keyNamePlaceholder")} autoComplete="off" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" icon={<KeyRound className="size-4" />} loading={saving} disabled={chosen === null}>
                {t("connect.createKey")}
              </Button>
            </div>
          </form>
        )}

        {created ? (
          <div className="animate-pop space-y-3 rounded-xl border border-accent-line bg-accent-soft p-3.5">
            <div>
              <p className="text-sm font-bold text-ink">{t("connect.newKeyTitle", { name: created.name })}</p>
              <p className="mt-0.5 text-xs text-ink-2">{t("connect.newKeyHint")}</p>
            </div>
            {address ? <CopyLine label={t("connect.address")} value={address} /> : null}
            <CopyLine label={t("connect.key")} value={created.token} />
            <Button size="sm" variant="secondary" onClick={() => setCreated(null)}>
              {t("connect.done")}
            </Button>
          </div>
        ) : null}

        {keys.error && !keys.data ? (
          <ErrorState title={t("common.loadFailed")} description={t("common.loadFailedHint")} retryLabel={t("common.retry")} onRetry={keys.reload} />
        ) : !keys.data ? (
          <Skeleton className="h-12" />
        ) : keys.data.length === 0 ? (
          <EmptyState className="py-6" icon={<Plus className="size-5" />} title={t("connect.noKeys")} />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {keys.data.map((key) => (
              <li key={key.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2">
                  <KeyRound className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] font-semibold text-ink">{key.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-faint">…{key.hint}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[
                      key.deviceName,
                      key.lastReport ? `${browserLabel(key.lastReport.browser, t)} · ${key.lastReport.profile}` : null,
                      key.lastUsedAt ? t("connect.lastUsed", { when: format.relativeDays(key.lastUsedAt) }) : t("connect.neverUsed"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <IconButton label={t("connect.revoke")} onClick={() => setRevoking(key)} className="hover:bg-danger-soft hover:text-danger-ink">
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={revoking !== null}
        title={t("connect.revokeTitle", { name: revoking?.name ?? "" })}
        description={t("connect.revokeBody")}
        confirmLabel={t("connect.revoke")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={() => void revoke()}
        onCancel={() => setRevoking(null)}
      />
    </Card>
  );
}
