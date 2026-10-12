"use client";

import { Pencil, RotateCcw, Siren, Trash2 } from "lucide-react";
import { useState } from "react";
import type { IncidentView } from "@/modules/compliance/incidents";
import type { RopaView } from "@/modules/compliance/ropa";
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES, type IncidentDetails } from "@/modules/compliance/types";
import { api, ApiClientError, firstFieldErrors, type Json } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Badge, type BadgeTone } from "@/shared/ui/badge";
import { Button, IconButton } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { DataTable, Pagination, type Column } from "@/shared/ui/data-table";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { Drawer } from "@/shared/ui/drawer";
import { Alert, EmptyState } from "@/shared/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/shared/ui/form-controls";
import { ListToolbar } from "@/shared/ui/list-toolbar";
import { useApi } from "@/shared/ui/use-api";
import { useList } from "@/shared/ui/use-list";
import { useNow } from "@/shared/ui/use-now";
import { useToast } from "@/shared/ui/toast";
import { DeadlineLabel, DocumentDownloads, type ComplianceArea } from "./shared";

type Row = Json<IncidentView>;
type Activity = Json<RopaView>;

const TIMES = ["occurredAt", "discoveredAt", "containedAt", "subjectsNotifiedAt", "authorityNotifiedAt", "publicNotifiedAt", "closedAt"] as const;
type TimeField = (typeof TIMES)[number];

type Draft = {
  title: string;
  severity: (typeof INCIDENT_SEVERITIES)[number];
  status: (typeof INCIDENT_STATUSES)[number];
  affectedCount: string;
  times: Record<TimeField, string>;
  details: Required<IncidentDetails>;
};

const SEVERITY_TONES: Record<string, BadgeTone> = { low: "ok", medium: "warn", high: "danger" };
const STATUS_TONES: Record<string, BadgeTone> = { open: "danger", contained: "warn", notified: "accent", closed: "ok" };

/** ISO time → value of an <input type="datetime-local"> in the browser's time zone. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyDraft(now: Date): Draft {
  const times = Object.fromEntries(TIMES.map((field) => [field, ""])) as Record<TimeField, string>;
  times.discoveredAt = toLocalInput(now.toISOString());
  return {
    title: "",
    severity: "medium",
    status: "open",
    affectedCount: "",
    times,
    details: { description: "", cause: "", dataCategories: "", consequences: "", measures: "", notificationNote: "", reporterName: "", activityKeys: [] },
  };
}

function draftOf(row: Row): Draft {
  const times = Object.fromEntries(TIMES.map((field) => [field, toLocalInput(row[field])])) as Record<TimeField, string>;
  const details = row.details ?? {};
  return {
    title: row.title,
    severity: row.severity,
    status: row.status,
    affectedCount: row.affectedCount === null ? "" : String(row.affectedCount),
    times,
    details: {
      description: details.description ?? "",
      cause: details.cause ?? "",
      dataCategories: details.dataCategories ?? "",
      consequences: details.consequences ?? "",
      measures: details.measures ?? "",
      notificationNote: details.notificationNote ?? "",
      reporterName: details.reporterName ?? "",
      activityKeys: details.activityKeys ?? [],
    },
  };
}

/** Breach register: every incident with its 3 x 24 hour notification deadline (UU PDP Art. 46). */
export function IncidentsList({ area }: { area: ComplianceArea }) {
  const { t, format } = useI18n();
  const notify = useToast();
  const now = useNow();
  const list = useList<Row>(`${area.api}/incidents`, `${area.api}/incidents/trashed`);
  const activities = useApi<Activity[]>(`${area.api}/ropa`);
  const [editing, setEditing] = useState<{ id: number | null; draft: Draft } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<{ kind: "delete" | "restore"; row: Row } | null>(null);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setErrors({});
    const { draft } = editing;
    const body = {
      title: draft.title,
      severity: draft.severity,
      status: draft.status,
      affectedCount: draft.affectedCount.trim() === "" ? null : Number(draft.affectedCount),
      ...Object.fromEntries(TIMES.map((field) => [field, draft.times[field] ? new Date(draft.times[field]).toISOString() : null])),
      details: draft.details,
    };
    try {
      const { message } = editing.id
        ? await api(`${area.api}/incidents/${editing.id}`, { method: "PATCH", body })
        : await api(`${area.api}/incidents`, { body });
      notify(message);
      setEditing(null);
      list.reload();
    } catch (error) {
      setErrors(firstFieldErrors(error));
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
    if (!target) return;
    try {
      const { message } =
        target.kind === "delete"
          ? await api(`${area.api}/incidents/${target.row.id}`, { method: "DELETE" })
          : await api(`${area.api}/incidents/${target.row.id}/restore`, { method: "PATCH" });
      notify(message);
      setTarget(null);
      list.reload();
    } catch (error) {
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    }
  };

  const columns: Column<Row>[] = [
    {
      key: "incident",
      header: t("privacyHub.incident"),
      cell: (row) => (
        <span className="block min-w-0">
          <span className="font-mono text-xs font-semibold text-muted">{row.code}</span>
          <span className="block font-semibold text-ink">{row.title}</span>
        </span>
      ),
    },
    { key: "severity", header: t("complianceDoc.severity"), cell: (row) => <Badge tone={SEVERITY_TONES[row.severity]}>{t.dynamic(`compliance.severity.${row.severity}`)}</Badge> },
    { key: "status", header: t("common.status"), cell: (row) => <Badge tone={STATUS_TONES[row.status]}>{t.dynamic(`compliance.incidentStatus.${row.status}`)}</Badge> },
    {
      key: "deadline",
      header: t("privacyHub.noticeDeadline"),
      cell: (row) =>
        row.hoursLeft === null ? (
          <Badge tone="ok">{t("privacyHub.notified")}</Badge>
        ) : (
          <DeadlineLabel deadline={row.noticeDeadlineAt} done={false} now={now} />
        ),
    },
    { key: "discovered", header: t("complianceDoc.discoveredAt"), hideOnMobile: true, cell: (row) => <span className="whitespace-nowrap text-xs text-muted">{format.dateTime(row.discoveredAt)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">{t("common.actions")}</span>,
      className: "w-px text-right",
      cell: (row) =>
        list.trashed ? (
          area.canManage ? (
            <IconButton label={t("common.restore")} onClick={() => setTarget({ kind: "restore", row })}>
              <RotateCcw className="size-4 text-ok-ink" />
            </IconButton>
          ) : null
        ) : (
          <div className="flex items-center justify-end gap-1">
            <DocumentDownloads href={`${area.api}/incidents/${row.id}/document`} compact />
            {area.canManage ? (
              <>
                <IconButton label={t("common.edit")} onClick={() => setEditing({ id: row.id, draft: draftOf(row) })}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label={t("common.delete")} onClick={() => setTarget({ kind: "delete", row })}>
                  <Trash2 className="size-4 text-danger-ink" />
                </IconButton>
              </>
            ) : null}
          </div>
        ),
    },
  ];

  const draft = editing?.draft;
  const setDraft = (patch: Partial<Draft>) => editing && setEditing({ ...editing, draft: { ...editing.draft, ...patch } });
  const setTime = (field: TimeField, value: string) => draft && setDraft({ times: { ...draft.times, [field]: value } });
  const setDetail = (patch: Partial<Draft["details"]>) => draft && setDraft({ details: { ...draft.details, ...patch } });

  return (
    <Card>
      <ListToolbar
        search={list.search}
        onSearch={list.setSearch}
        trashed={list.trashed}
        onToggleTrash={list.toggleTrash}
        createLabel={area.canManage ? t("privacyHub.newIncident") : undefined}
        onCreate={area.canManage ? () => setEditing({ id: null, draft: emptyDraft(new Date()) }) : undefined}
      />
      <DataTable
        columns={columns}
        rows={list.data?.items}
        rowKey={(row) => row.id}
        loading={list.loading}
        error={Boolean(list.error)}
        onRetry={list.reload}
        empty={
          list.trashed ? (
            <EmptyState icon={<Trash2 className="size-6" />} title={t("common.trashEmpty")} />
          ) : (
            <EmptyState icon={<Siren className="size-6" />} title={t("privacyHub.incidentsEmpty")} description={t("privacyHub.incidentsEmptyHint")} />
          )
        }
      />
      {list.data ? <Pagination page={list.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={list.setPage} /> : null}

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? t("privacyHub.editIncident") : t("privacyHub.newIncident")}
        description={t("privacyHub.incidentHint")}
        closeLabel={t("common.close")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {t("common.save")}
            </Button>
          </div>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <Field label={t("complianceDoc.incidentTitle")} htmlFor="incidentTitle" required error={errors.title}>
              <Input id="incidentTitle" value={draft.title} onChange={(e) => setDraft({ title: e.target.value })} invalid={Boolean(errors.title)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("complianceDoc.severity")} htmlFor="incidentSeverity">
                <Select id="incidentSeverity" value={draft.severity} onChange={(e) => setDraft({ severity: e.target.value as Draft["severity"] })}>
                  {INCIDENT_SEVERITIES.map((value) => (
                    <option key={value} value={value}>
                      {t.dynamic(`compliance.severity.${value}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("common.status")} htmlFor="incidentStatus">
                <Select id="incidentStatus" value={draft.status} onChange={(e) => setDraft({ status: e.target.value as Draft["status"] })}>
                  {INCIDENT_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {t.dynamic(`compliance.incidentStatus.${value}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Alert tone="warning">{t("privacyHub.deadlineRule")}</Alert>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TIMES.map((field) => (
                <Field key={field} label={t.dynamic(`complianceDoc.${field}`)} htmlFor={`incident-${field}`} required={field === "discoveredAt"} error={errors[field]}>
                  <Input id={`incident-${field}`} type="datetime-local" value={draft.times[field]} onChange={(e) => setTime(field, e.target.value)} invalid={Boolean(errors[field])} />
                </Field>
              ))}
            </div>
            <Field label={t("complianceDoc.dataExposed")} htmlFor="incidentData" hint={t("privacyHub.dataExposedHint")}>
              <Textarea id="incidentData" value={draft.details.dataCategories} onChange={(e) => setDetail({ dataCategories: e.target.value })} className="min-h-16" />
            </Field>
            <Field label={t("complianceDoc.affectedCount")} htmlFor="incidentCount" optionalLabel={t("common.optional")} error={errors.affectedCount}>
              <Input id="incidentCount" type="number" min={0} value={draft.affectedCount} onChange={(e) => setDraft({ affectedCount: e.target.value })} />
            </Field>
            {(["description", "cause", "consequences", "measures", "notificationNote"] as const).map((field) => (
              <Field key={field} label={t.dynamic(`complianceDoc.${field === "description" ? "incidentDescription" : field}`)} htmlFor={`incident-${field}`}>
                <Textarea id={`incident-${field}`} value={draft.details[field]} onChange={(e) => setDetail({ [field]: e.target.value })} className="min-h-20" />
              </Field>
            ))}
            <Field label={t("complianceDoc.reporter")} htmlFor="incidentReporter">
              <Input id="incidentReporter" value={draft.details.reporterName} onChange={(e) => setDetail({ reporterName: e.target.value })} />
            </Field>
            <fieldset className="space-y-2">
              <legend className="text-[13px] font-medium text-ink-2">{t("complianceDoc.relatedActivities")}</legend>
              {(activities.data ?? [])
                .filter((activity) => activity.kind !== "processor")
                .map((activity) => (
                  <Checkbox
                    key={activity.key}
                    checked={draft.details.activityKeys.includes(activity.key)}
                    onChange={(e) =>
                      setDetail({
                        activityKeys: e.target.checked ? [...draft.details.activityKeys, activity.key] : draft.details.activityKeys.filter((key) => key !== activity.key),
                      })
                    }
                    label={`${activity.code} — ${Array.isArray(activity.fields.name.value) ? activity.fields.name.value.join(", ") : activity.fields.name.value}`}
                  />
                ))}
            </fieldset>
          </div>
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={target !== null}
        title={target?.kind === "restore" ? t("privacyHub.restoreTitle") : t("privacyHub.deleteTitle")}
        description={target?.kind === "restore" ? t("privacyHub.restoreBody") : t("privacyHub.deleteBody")}
        confirmLabel={target?.kind === "restore" ? t("common.restore") : t("common.delete")}
        cancelLabel={t("common.cancel")}
        tone={target?.kind === "restore" ? "primary" : "danger"}
        onConfirm={() => void confirm()}
        onCancel={() => setTarget(null)}
      />
    </Card>
  );
}
