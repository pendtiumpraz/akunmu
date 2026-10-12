"use client";

import { AlertTriangle, FileCheck2, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DpiaView } from "@/modules/compliance/dpia";
import type { RopaView } from "@/modules/compliance/ropa";
import { api, ApiClientError, type Json } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Badge } from "@/shared/ui/badge";
import { Button, IconButton, buttonClasses } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { DataTable, type Column } from "@/shared/ui/data-table";
import { Drawer } from "@/shared/ui/drawer";
import { EmptyState } from "@/shared/ui/feedback";
import { Field, Select } from "@/shared/ui/form-controls";
import { useApi } from "@/shared/ui/use-api";
import { useToast } from "@/shared/ui/toast";
import { DocumentDownloads, RiskPill, type ComplianceArea } from "./shared";

type Row = Json<DpiaView>;
type Activity = Json<RopaView>;

const nameOf = (activity: Activity) => (Array.isArray(activity.fields.name.value) ? activity.fields.name.value.join(", ") : activity.fields.name.value);

/** DPIAs of the owner, plus the activities whose criteria make a DPIA mandatory but have none yet. */
export function DpiaList({ area }: { area: ComplianceArea }) {
  const { t, format } = useI18n();
  const notify = useToast();
  const router = useRouter();
  const [trashed, setTrashed] = useState(false);
  const list = useApi<Row[]>(trashed ? `${area.api}/dpia/trashed` : `${area.api}/dpia`);
  const activities = useApi<Activity[]>(`${area.api}/ropa`);
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState("");
  const [starting, setStarting] = useState<string | null>(null);

  const candidates = (activities.data ?? []).filter((activity) => activity.kind !== "processor" && !activity.dpia);
  const required = candidates.filter((activity) => activity.dpiaRequired);

  const start = async (key: string) => {
    setStarting(key);
    try {
      const { message } = await api<Row>(`${area.api}/dpia`, { body: { key } });
      notify(message);
      router.push(`${area.pages}/dpia/${encodeURIComponent(key)}`);
    } catch (error) {
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    } finally {
      setStarting(null);
    }
  };

  const restore = async (row: Row) => {
    try {
      const { message } = await api(`${area.api}/dpia/${encodeURIComponent(row.key)}/restore`, { method: "PATCH" });
      notify(message);
      list.reload();
      activities.reload();
    } catch (error) {
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    }
  };

  const columns: Column<Row>[] = [
    {
      key: "dpia",
      header: "DPIA",
      cell: (row) => (
        <Link href={`${area.pages}/dpia/${encodeURIComponent(row.key)}`} className="group block">
          <span className="font-mono text-xs font-semibold text-muted">{row.code}</span>
          <span className="block font-semibold text-ink group-hover:text-accent">{row.activityName}</span>
        </Link>
      ),
    },
    { key: "status", header: t("common.status"), cell: (row) => <Badge tone={row.status === "approved" ? "ok" : row.status === "review" ? "accent" : "neutral"}>{t.dynamic(`compliance.dpiaStatus.${row.status}`)}</Badge> },
    { key: "risk", header: t("privacyHub.risk"), cell: (row) => <RiskPill level={row.summary.overall} /> },
    {
      key: "mitigate",
      header: t("privacyHub.toMitigate"),
      hideOnMobile: true,
      cell: (row) => <span className="text-sm text-muted">{t("privacyHub.mitigateCount", { count: row.summary.toMitigate, total: row.summary.scored })}</span>,
    },
    { key: "updated", header: t("privacyHub.updated"), hideOnMobile: true, cell: (row) => <span className="whitespace-nowrap text-xs text-muted">{format.dateTime(row.updatedAt)}</span> },
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
            <DocumentDownloads href={`${area.api}/dpia/${encodeURIComponent(row.key)}/document`} compact />
            <Link href={`${area.pages}/dpia/${encodeURIComponent(row.key)}`} className={buttonClasses("secondary", "sm")}>
              {area.canManage ? t("common.edit") : t("common.open")}
            </Link>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      {!trashed && required.length > 0 ? (
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <AlertTriangle className="size-4 text-warn-ink" />
            {t("privacyHub.dpiaNeededTitle", { count: required.length })}
          </h2>
          <p className="mt-1 text-[13px] text-muted">{t("privacyHub.dpiaNeededHint")}</p>
          <ul className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {required.map((activity) => (
              <li key={activity.key} className="flex items-center justify-between gap-3 rounded-xl border border-warn-line bg-warn-soft px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-mono text-xs text-warn-ink">{activity.code}</span>
                  <span className="block truncate text-sm font-semibold text-ink">{nameOf(activity)}</span>
                  <span className="block truncate text-xs text-muted">
                    {activity.criteria
                      .filter((entry) => entry.met)
                      .map((entry) => t.dynamic(`privacyHub.criterionShort.${entry.criterion}`))
                      .join(" · ")}
                  </span>
                </span>
                {area.canManage ? (
                  <Button size="sm" onClick={() => void start(activity.key)} loading={starting === activity.key}>
                    {t("privacyHub.startDpia")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card>
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{trashed ? t("privacyHub.dpiaTrash") : t("privacyHub.dpiaTitle")}</h2>
            <p className="text-[13px] text-muted">{t("privacyHub.dpiaHint")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTrashed((value) => !value)} icon={<Trash2 className="size-4" />}>
              {trashed ? t("common.backToList") : t("common.trash")}
            </Button>
            {area.canManage && !trashed ? (
              <Button size="sm" onClick={() => setPicking(true)} icon={<Plus className="size-4" />} disabled={candidates.length === 0}>
                {t("privacyHub.newDpia")}
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
          empty={trashed ? <EmptyState icon={<Trash2 className="size-6" />} title={t("common.trashEmpty")} /> : <EmptyState icon={<FileCheck2 className="size-6" />} title={t("privacyHub.dpiaEmpty")} description={t("privacyHub.dpiaEmptyHint")} />}
        />
      </Card>
      <Drawer
        open={picking}
        onClose={() => setPicking(false)}
        title={t("privacyHub.newDpia")}
        description={t("privacyHub.newDpiaHint")}
        closeLabel={t("common.close")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPicking(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => choice && void start(choice)} loading={starting !== null} disabled={!choice}>
              {t("privacyHub.startDpia")}
            </Button>
          </div>
        }
      >
        <Field label={t("privacyHub.activity")} htmlFor="dpiaActivity" required>
          <Select id="dpiaActivity" value={choice} onChange={(event) => setChoice(event.target.value)}>
            <option value="">{t("privacyHub.chooseActivity")}</option>
            {candidates.map((activity) => (
              <option key={activity.key} value={activity.key}>
                {activity.code} — {nameOf(activity)}
                {activity.dpiaRequired ? ` (${t("privacyHub.dpiaRequired")})` : ""}
              </option>
            ))}
          </Select>
        </Field>
      </Drawer>
    </div>
  );
}
