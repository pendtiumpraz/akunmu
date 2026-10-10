"use client";

import { ArrowLeft, Laptop, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/shared/ui/feedback";
import { useToast } from "@/shared/ui/toast";
import { useApi } from "@/shared/ui/use-api";
import { useStaff } from "../app-shell";
import { DeviceDrawer } from "../drawers/device-drawer";
import type { DeviceListItem } from "../map-types";
import { DeviceIcon, kindLabel, systemLabel } from "../ui";

/** Devices as cards (CRUD in one page): search, add, open, and the trash with restore. */
export function DevicesManager({ startAdding }: { startAdding: boolean }) {
  const { t, format } = useI18n();
  const { can } = useStaff();
  const notify = useToast();
  const canWrite = can("map.write");
  const [trashed, setTrashed] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(startAdding && canWrite);
  const [restoring, setRestoring] = useState<DeviceListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useApi<DeviceListItem[]>(trashed ? "/api/devices/trashed" : "/api/devices");

  const needle = search.trim().toLowerCase();
  const devices = (list.data ?? []).filter((device) => !needle || [device.name, device.location, device.notes].some((text) => text?.toLowerCase().includes(needle)));

  const restore = async () => {
    if (!restoring) return;
    setBusy(true);
    try {
      const result = await api(`/api/devices/${restoring.id}/restore`, { method: "PATCH" });
      notify(result.message);
      setRestoring(null);
      list.reload();
    } catch (error) {
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={trashed ? t("devices.trashTitle") : t("nav.devices")}
        description={trashed ? t("devices.trashHint") : t("devices.listHint")}
        actions={
          <>
            <Button variant={trashed ? "secondary" : "ghost"} icon={trashed ? <ArrowLeft className="size-4" /> : <Trash2 className="size-4" />} onClick={() => setTrashed((value) => !value)}>
              {trashed ? t("common.backToList") : t("common.trash")}
            </Button>
            {!trashed && canWrite ? (
              <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                {t("devices.addTitle")}
              </Button>
            ) : null}
          </>
        }
      />
      <label className="relative mb-4 block max-w-sm">
        <span className="sr-only">{t("common.search")}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("devices.searchPlaceholder")}
          className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft"
        />
      </label>

      {list.error && !list.data ? (
        <ErrorState title={t("common.loadFailed")} description={t("common.loadFailedHint")} retryLabel={t("common.retry")} onRetry={list.reload} />
      ) : !list.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState
            icon={trashed ? <Trash2 className="size-5" /> : <Laptop className="size-5" />}
            title={trashed ? t("devices.trashEmpty") : needle ? t("common.noResults") : t("devices.empty")}
            description={trashed || needle ? undefined : t("devices.emptyHint")}
            action={
              !trashed && !needle && canWrite ? (
                <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                  {t("devices.addTitle")}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {devices.map((device) => {
            const body = (
              <>
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-sunken text-ink-2">
                    <DeviceIcon kind={device.kind} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-ink">{device.name}</p>
                    <p className="truncate text-xs text-muted">{[kindLabel(device.kind, t), systemLabel(device.system, t), device.location].filter(Boolean).join(" · ")}</p>
                  </div>
                  {device.reviewCount > 0 && !trashed ? <Badge tone="warn">{t("devices.reviewCount", { count: device.reviewCount })}</Badge> : null}
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-subtle px-3 py-2">
                  {[
                    { label: t("devices.statProfiles"), value: device.profileCount },
                    { label: t("devices.statAccounts"), value: device.accountCount },
                    { label: t("devices.statSignIns"), value: device.signInCount },
                  ].map((stat) => (
                    <div key={stat.label} className="min-w-0">
                      <dt className="truncate text-[11px] font-semibold text-muted">{stat.label}</dt>
                      <dd className="font-mono text-base font-bold text-ink tabular-nums">{format.number(stat.value)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-muted">
                  {trashed && device.deletedAt
                    ? t("common.deletedOn", { date: format.dateTime(device.deletedAt) })
                    : device.lastCheckedAt
                      ? t("devices.lastChecked", { when: format.relativeDays(device.lastCheckedAt) })
                      : t("devices.neverChecked")}
                </p>
              </>
            );
            return (
              <li key={device.id}>
                {trashed ? (
                  <div className="rounded-panel border border-line bg-surface p-4">
                    {body}
                    {canWrite ? (
                      <Button variant="secondary" size="sm" className="mt-3" icon={<RotateCcw className="size-4" />} onClick={() => setRestoring(device)}>
                        {t("common.restore")}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <Link href={`/app/devices/${device.id}`} className="block rounded-panel border border-line bg-surface p-4 transition-colors hover:border-line-strong">
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <DeviceDrawer
          device={null}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            list.reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={restoring !== null}
        tone="primary"
        title={t("devices.restoreTitle")}
        description={restoring ? t("devices.restoreBody", { name: restoring.name }) : undefined}
        confirmLabel={t("common.restore")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={() => void restore()}
        onCancel={() => setRestoring(null)}
      />
    </>
  );
}
