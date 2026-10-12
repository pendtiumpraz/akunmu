"use client";

import { Inbox, MessageSquareReply, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { PrivacyRequestRecord } from "@/modules/privacy/schema";
import { PRIVACY_REQUEST_STATUSES, PRIVACY_REQUEST_TYPES, type PrivacyRequestType } from "@/modules/privacy/types";
import { api, ApiClientError, firstFieldErrors, type Json } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Badge, type BadgeTone } from "@/shared/ui/badge";
import { Button, IconButton } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { DataTable, Pagination, type Column } from "@/shared/ui/data-table";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { Drawer } from "@/shared/ui/drawer";
import { Alert, EmptyState } from "@/shared/ui/feedback";
import { Field, Input, Select, Textarea } from "@/shared/ui/form-controls";
import { ListToolbar } from "@/shared/ui/list-toolbar";
import { useList } from "@/shared/ui/use-list";
import { useNow } from "@/shared/ui/use-now";
import { useToast } from "@/shared/ui/toast";
import { DeadlineLabel, type ComplianceArea } from "./shared";

type Row = Json<PrivacyRequestRecord>;

const STATUS_TONES: Record<string, BadgeTone> = { received: "warn", in_progress: "accent", completed: "ok", rejected: "neutral" };

type Answer = { row: Row; status: string; response: string };
type Recorded = { requesterName: string; requesterEmail: string; requestType: PrivacyRequestType; description: string };

const EMPTY_RECORD: Recorded = { requesterName: "", requesterEmail: "", requestType: "access", description: "" };

/**
 * Data subject requests of the owner (UU PDP Art. 5–14): filed by users from Settings → My data, or recorded
 * by staff from an email or letter. Each has the 3 x 24 hour deadline; answering closes it.
 */
export function RequestsList({ area }: { area: ComplianceArea }) {
  const { t, format } = useI18n();
  const notify = useToast();
  const now = useNow();
  const list = useList<Row>(`${area.api}/requests`, `${area.api}/requests/trashed`);
  const [answering, setAnswering] = useState<Answer | null>(null);
  const [recording, setRecording] = useState<Recorded | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<{ kind: "delete" | "restore"; row: Row } | null>(null);

  const fail = (error: unknown) => notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");

  const answer = async () => {
    if (!answering) return;
    setSaving(true);
    try {
      const { message } = await api(`${area.api}/requests/${answering.row.id}`, { method: "PATCH", body: { status: answering.status, response: answering.response } });
      notify(message);
      setAnswering(null);
      list.reload();
    } catch (error) {
      fail(error);
    } finally {
      setSaving(false);
    }
  };

  const record = async () => {
    if (!recording) return;
    setSaving(true);
    setErrors({});
    try {
      const { message } = await api(`${area.api}/requests`, { body: recording });
      notify(message);
      setRecording(null);
      list.reload();
    } catch (error) {
      setErrors(firstFieldErrors(error));
      fail(error);
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
    if (!target) return;
    try {
      const { message } =
        target.kind === "delete"
          ? await api(`${area.api}/requests/${target.row.id}`, { method: "DELETE" })
          : await api(`${area.api}/requests/${target.row.id}/restore`, { method: "PATCH" });
      notify(message);
      setTarget(null);
      list.reload();
    } catch (error) {
      fail(error);
    }
  };

  const columns: Column<Row>[] = [
    {
      key: "request",
      header: t("privacyHub.request"),
      cell: (row) => (
        <span className="block min-w-0">
          <span className="font-mono text-xs font-semibold text-muted">{row.code}</span>
          <span className="block truncate font-semibold text-ink">{row.requesterName || row.requesterEmail}</span>
          <span className="block truncate font-mono text-xs text-muted">{row.requesterEmail}</span>
        </span>
      ),
    },
    { key: "type", header: t("privacyHub.requestType"), cell: (row) => <span className="text-ink-2">{t.dynamic(`privacyRequest.type.${row.requestType}`)}</span> },
    { key: "status", header: t("privacyHub.status"), cell: (row) => <Badge tone={STATUS_TONES[row.status] ?? "neutral"}>{t.dynamic(`privacyRequest.status.${row.status}`)}</Badge> },
    { key: "deadline", header: t("privacyHub.deadline"), cell: (row) => <DeadlineLabel deadline={row.deadlineAt} done={Boolean(row.closedAt)} now={now} /> },
    {
      key: "received",
      header: t("privacyHub.received"),
      hideOnMobile: true,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {format.dateTime(row.createdAt)}
          <span className="block">{row.channel === "staff" ? t("privacyHub.channelStaff") : t("privacyHub.channelApp")}</span>
        </span>
      ),
    },
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
        ) : area.canManage ? (
          <div className="flex justify-end gap-1">
            <IconButton label={t("privacyHub.answer")} onClick={() => setAnswering({ row, status: row.status === "received" ? "in_progress" : row.status, response: row.response ?? "" })}>
              <MessageSquareReply className="size-4 text-accent" />
            </IconButton>
            {row.closedAt ? (
              <IconButton label={t("common.delete")} onClick={() => setTarget({ kind: "delete", row })}>
                <Trash2 className="size-4 text-danger-ink" />
              </IconButton>
            ) : null}
          </div>
        ) : null,
    },
  ];

  return (
    <Card>
      <ListToolbar
        search={list.search}
        onSearch={list.setSearch}
        trashed={list.trashed}
        onToggleTrash={list.toggleTrash}
        createLabel={area.canManage ? t("privacyHub.recordRequest") : undefined}
        onCreate={area.canManage ? () => setRecording({ ...EMPTY_RECORD }) : undefined}
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
            <EmptyState
              icon={<Inbox className="size-6" />}
              title={t("privacyHub.requestsEmpty")}
              description={area.scope === "platform" ? t("privacyHub.requestsEmptyPlatform") : t("privacyHub.requestsEmptyHint")}
            />
          )
        }
      />
      {list.data ? <Pagination page={list.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={list.setPage} /> : null}

      <Drawer
        open={answering !== null}
        onClose={() => setAnswering(null)}
        title={t("privacyHub.answerTitle", { id: answering?.row.code ?? "" })}
        description={answering ? t.dynamic(`privacyRequest.type.${answering.row.requestType}`) : undefined}
        closeLabel={t("common.close")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAnswering(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void answer()} loading={saving}>
              {t("common.save")}
            </Button>
          </div>
        }
      >
        {answering ? (
          <div className="space-y-4">
            <div>
              <p className="text-[13px] font-semibold text-ink-2">{t("privacyHub.requester")}</p>
              <p className="mt-1 text-sm text-ink">{answering.row.requesterName}</p>
              <p className="font-mono text-xs text-muted">{answering.row.requesterEmail}</p>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-ink-2">{t("privacyHub.requesterMessage")}</p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg border border-line bg-subtle p-3 text-sm text-ink">{answering.row.description || t("privacyHub.noMessage")}</p>
            </div>
            <Alert tone="info">{t.dynamic(`privacyHub.howTo.${answering.row.requestType}`)}</Alert>
            <Field label={t("privacyHub.status")} htmlFor="requestStatus">
              <Select id="requestStatus" value={answering.status} onChange={(event) => setAnswering({ ...answering, status: event.target.value })}>
                {PRIVACY_REQUEST_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t.dynamic(`privacyRequest.status.${status}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("privacyHub.response")} htmlFor="requestResponse" hint={t("privacyHub.responseHint")}>
              <Textarea id="requestResponse" value={answering.response} onChange={(event) => setAnswering({ ...answering, response: event.target.value })} className="min-h-32" maxLength={4000} />
            </Field>
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={recording !== null}
        onClose={() => setRecording(null)}
        title={t("privacyHub.recordRequest")}
        description={t("privacyHub.recordRequestHint")}
        closeLabel={t("common.close")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRecording(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void record()} loading={saving}>
              {t("common.create")}
            </Button>
          </div>
        }
      >
        {recording ? (
          <div className="space-y-4">
            <Field label={t("privacyHub.requesterName")} htmlFor="recordName" required error={errors.requesterName}>
              <Input id="recordName" value={recording.requesterName} onChange={(event) => setRecording({ ...recording, requesterName: event.target.value })} invalid={Boolean(errors.requesterName)} />
            </Field>
            <Field label={t("privacyHub.requesterEmail")} htmlFor="recordEmail" required error={errors.requesterEmail}>
              <Input id="recordEmail" type="email" value={recording.requesterEmail} onChange={(event) => setRecording({ ...recording, requesterEmail: event.target.value })} invalid={Boolean(errors.requesterEmail)} />
            </Field>
            <Field label={t("privacyHub.requestType")} htmlFor="recordType">
              <Select id="recordType" value={recording.requestType} onChange={(event) => setRecording({ ...recording, requestType: event.target.value as PrivacyRequestType })}>
                {PRIVACY_REQUEST_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t.dynamic(`privacyRequest.type.${type}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("privacyHub.requesterMessage")} htmlFor="recordMessage" optionalLabel={t("common.optional")} error={errors.description}>
              <Textarea id="recordMessage" value={recording.description} onChange={(event) => setRecording({ ...recording, description: event.target.value })} className="min-h-24" maxLength={2000} />
            </Field>
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
