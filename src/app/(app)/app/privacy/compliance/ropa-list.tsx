"use client";

import { ClipboardList, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RopaView } from "@/modules/compliance/ropa";
import { api, ApiClientError, type Json } from "@/shared/http/client";
import type { LocalizedText } from "@/shared/i18n/localized";
import { useI18n } from "@/shared/i18n/client";
import { Badge } from "@/shared/ui/badge";
import { Button, IconButton, buttonClasses } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { DataTable, type Column } from "@/shared/ui/data-table";
import { Drawer } from "@/shared/ui/drawer";
import { EmptyState } from "@/shared/ui/feedback";
import { Field } from "@/shared/ui/form-controls";
import { LocalizedInput } from "@/shared/ui/localized-input";
import { useApi } from "@/shared/ui/use-api";
import { useToast } from "@/shared/ui/toast";
import { DocumentDownloads, RiskPill, type ComplianceArea } from "./shared";

type Row = Json<RopaView>;

function text(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

/** Records of processing activities: one row per activity, with completeness, DPIA status and downloads. */
export function RopaList({ area }: { area: ComplianceArea }) {
  const { t, format } = useI18n();
  const notify = useToast();
  const router = useRouter();
  const [trashed, setTrashed] = useState(false);
  const list = useApi<Row[]>(trashed ? `${area.api}/ropa/trashed` : `${area.api}/ropa`);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState<LocalizedText>({});
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const { data, message } = await api<Row>(`${area.api}/ropa`, { body: { name } });
      notify(message);
      setCreating(false);
      setName({});
      router.push(`${area.pages}/ropa/${encodeURIComponent(data.key)}`);
    } catch (error) {
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (row: Row) => {
    try {
      const { message } = await api(`${area.api}/ropa/${encodeURIComponent(row.key)}/restore`, { method: "PATCH" });
      notify(message);
      list.reload();
    } catch (error) {
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    }
  };

  const columns: Column<Row>[] = [
    {
      key: "activity",
      header: t("privacyHub.activity"),
      cell: (row) => (
        <Link href={`${area.pages}/ropa/${encodeURIComponent(row.key)}`} className="group block min-w-0">
          <span className="font-mono text-xs font-semibold text-muted">{row.code}</span>
          <span className="block font-semibold text-ink group-hover:text-accent">{text(row.fields.name.value)}</span>
          <span className="mt-1 flex flex-wrap gap-1.5">
            {row.kind === "processor" ? <Badge tone="accent">{t("privacyHub.kindProcessor")}</Badge> : null}
            {row.kind === "custom" ? <Badge tone="accent">{t("privacyHub.kindCustom")}</Badge> : null}
            {row.status !== "active" ? <Badge tone="neutral">{t.dynamic(`compliance.status.${row.status}`)}</Badge> : null}
            {!row.inUse ? <Badge tone="neutral">{t("privacyHub.notUsedYet")}</Badge> : null}
          </span>
        </Link>
      ),
    },
    {
      key: "complete",
      header: t("privacyHub.completeness"),
      cell: (row) =>
        row.missing.length > 0 ? (
          <Badge tone="warn" dot>
            {t("privacyHub.missingCount", { count: row.missing.length })}
          </Badge>
        ) : (
          <Badge tone="ok" dot>
            {t("privacyHub.complete")}
          </Badge>
        ),
    },
    {
      key: "dpia",
      header: "DPIA",
      hideOnMobile: true,
      cell: (row) =>
        row.kind === "processor" ? (
          <span className="text-xs text-muted">{t("privacyHub.dpiaController")}</span>
        ) : row.dpia ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={row.dpia.status === "approved" ? "ok" : "accent"}>{t.dynamic(`compliance.dpiaStatus.${row.dpia.status}`)}</Badge>
            <RiskPill level={row.dpia.overall} />
          </span>
        ) : row.dpiaRequired ? (
          <Badge tone="danger" dot>
            {t("privacyHub.dpiaRequired")}
          </Badge>
        ) : (
          <span className="text-xs text-muted">{t("privacyHub.dpiaNotRequired")}</span>
        ),
    },
    {
      key: "updated",
      header: t("privacyHub.updated"),
      hideOnMobile: true,
      cell: (row) => <span className="whitespace-nowrap text-xs text-muted">{row.updatedAt ? format.dateTime(row.updatedAt) : t("privacyHub.defaults")}</span>,
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("common.actions")}</span>,
      className: "w-px text-right",
      cell: (row) =>
        trashed ? (
          area.canManage ? (
            <IconButton label={t("common.restore")} onClick={() => void restore(row)}>
              <RotateCcw className="size-4 text-ok-ink" />
            </IconButton>
          ) : null
        ) : (
          <div className="flex items-center justify-end gap-2">
            <DocumentDownloads href={`${area.api}/ropa/${encodeURIComponent(row.key)}/document`} compact />
            <Link href={`${area.pages}/ropa/${encodeURIComponent(row.key)}`} className={buttonClasses("secondary", "sm")}>
              {area.canManage ? t("common.edit") : t("common.open")}
            </Link>
          </div>
        ),
    },
  ];

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{trashed ? t("privacyHub.ropaTrash") : t("privacyHub.ropaTitle")}</h2>
          <p className="text-[13px] text-muted">{area.scope === "platform" ? t("privacyHub.ropaPlatformHint") : t("privacyHub.ropaHint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!trashed ? (
            <span className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted">{t("privacyHub.downloadAll")}</span>
              <DocumentDownloads href={`${area.api}/register`} />
            </span>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setTrashed((value) => !value)} icon={<Trash2 className="size-4" />}>
            {trashed ? t("common.backToList") : t("common.trash")}
          </Button>
          {area.canManage && !trashed ? (
            <Button size="sm" onClick={() => setCreating(true)} icon={<Plus className="size-4" />}>
              {t("privacyHub.addActivity")}
            </Button>
          ) : null}
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={list.data}
        rowKey={(row) => row.key}
        loading={list.loading}
        error={Boolean(list.error)}
        onRetry={list.reload}
        empty={
          trashed ? (
            <EmptyState icon={<Trash2 className="size-6" />} title={t("common.trashEmpty")} />
          ) : (
            <EmptyState icon={<ClipboardList className="size-6" />} title={t("privacyHub.ropaEmpty")} />
          )
        }
      />
      <Drawer
        open={creating}
        onClose={() => setCreating(false)}
        title={t("privacyHub.addActivity")}
        description={t("privacyHub.addActivityHint")}
        closeLabel={t("common.close")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void create()} loading={busy}>
              {t("common.create")}
            </Button>
          </div>
        }
      >
        <Field label={t("privacyHub.activityName")} required>
          <LocalizedInput value={name} onChange={setName} maxLength={200} />
        </Field>
      </Drawer>
    </Card>
  );
}
