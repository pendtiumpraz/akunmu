"use client";

import { Download, FileCheck2, Inbox, Plus, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConsentState } from "@/modules/privacy/consents";
import { PRIVACY_REQUEST_RECIPIENTS, PRIVACY_REQUEST_TYPES, type PrivacyRequestRecipient, type PrivacyRequestType } from "@/modules/privacy/types";
import { api, ApiClientError, firstFieldErrors, type Json } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Badge, type BadgeTone } from "@/shared/ui/badge";
import { Button, buttonClasses } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Drawer } from "@/shared/ui/drawer";
import { Alert, EmptyState, Skeleton } from "@/shared/ui/feedback";
import { Field, Input, Select, Switch, Textarea } from "@/shared/ui/form-controls";
import { SideTabs, useUrlTab, type TabItem } from "@/shared/ui/tabs";
import { useApi } from "@/shared/ui/use-api";
import { useNow } from "@/shared/ui/use-now";
import { useToast } from "@/shared/ui/toast";
import { DeadlineLabel } from "../../privacy/compliance/shared";

const TABS = ["consent", "export", "requests", "delete"] as const;
type Tab = (typeof TABS)[number];

type MyRequest = {
  id: number;
  code: string;
  recipient: PrivacyRequestRecipient;
  requestType: PrivacyRequestType;
  status: string;
  description: string | null;
  response: string | null;
  deadlineAt: string;
  respondedAt: string | null;
  closedAt: string | null;
  createdAt: string;
};

type NewRequest = { recipient: PrivacyRequestRecipient; requestType: PrivacyRequestType; description: string };

const STATUS_TONES: Record<string, BadgeTone> = { received: "warn", in_progress: "accent", completed: "ok", rejected: "neutral" };

function useFailure() {
  const { t } = useI18n();
  const notify = useToast();
  return (error: unknown) => notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
}

/** Consent proof and choices (PP 33/2026 Art. 36 and 37): accept the current policy, product news on or off. */
function ConsentPanel() {
  const { t, format } = useI18n();
  const notify = useToast();
  const fail = useFailure();
  const router = useRouter();
  const consent = useApi<Json<ConsentState>>("/api/me/consent");
  const [saving, setSaving] = useState(false);

  if (!consent.data) return <Skeleton className="h-48 w-full" />;
  const state = consent.data;

  const save = async (marketing: boolean) => {
    setSaving(true);
    try {
      const { data, message } = await api<Json<ConsentState>>("/api/me/consent", { method: "PUT", body: { marketing } });
      consent.setData(data);
      notify(message);
      router.refresh();
    } catch (error) {
      fail(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FileCheck2 className="size-4 text-accent" />
          {t("myData.consentTitle")}
        </h2>
        <p className="mt-1 text-[13px] text-muted">{t("myData.consentHint")}</p>
        {state.needsAcceptance ? (
          <Alert tone="warning" className="mt-4" title={t("myData.policyChanged")}>
            {t("myData.policyChangedBody", { version: state.policyVersion })}
          </Alert>
        ) : (
          <Alert tone="success" className="mt-4">
            {t("myData.policyAccepted", { version: state.acceptedVersion ?? "", date: state.acceptedAt ? format.dateTime(state.acceptedAt) : "" })}
          </Alert>
        )}
        <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
          <Link href="/legal/privacy" target="_blank" className="font-semibold text-accent hover:underline">
            {t("legal.privacy")}
          </Link>
          <span className="text-faint">·</span>
          <Link href="/legal/terms" target="_blank" className="font-semibold text-accent hover:underline">
            {t("legal.terms")}
          </Link>
        </div>
        {state.needsAcceptance ? (
          <Button className="mt-4" onClick={() => void save(state.marketing)} loading={saving} icon={<ShieldCheck className="size-4" />}>
            {t("myData.acceptPolicy")}
          </Button>
        ) : null}
        <div className="mt-5 border-t border-line pt-4">
          <Switch
            id="marketingConsent"
            checked={state.marketing}
            disabled={saving}
            onChange={(value) => void save(value)}
            label={t("myData.marketing")}
            description={t("myData.marketingHint")}
          />
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">{t("myData.historyTitle")}</h2>
        <p className="mt-1 text-[13px] text-muted">{t("myData.historyHint")}</p>
        {state.history.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("myData.historyEmpty")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {state.history.slice(0, 8).map((entry) => (
              <li key={entry.createdAt} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]">
                <span className="text-ink">
                  {t("myData.historyEntry", { version: entry.policyVersion })}
                  <span className="block text-xs text-muted">
                    {t.dynamic(`myData.source.${entry.source}`)} · {entry.marketing ? t("myData.marketingOn") : t("myData.marketingOff")}
                  </span>
                </span>
                <span className="whitespace-nowrap text-xs text-muted">{format.dateTime(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** A machine-readable copy of the user's data (UU PDP Art. 7 and 13). */
function ExportPanel() {
  const { t } = useI18n();
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Download className="size-4 text-accent" />
            {t("myData.exportTitle")}
          </h2>
          <p className="mt-1 text-[13px] text-muted">{t("myData.exportHint")}</p>
        </div>
        <a href="/api/me/data" download className={buttonClasses("primary", "md")}>
          <Download className="size-4" />
          {t("myData.exportButton")}
        </a>
      </div>
      <ul className="mt-4 grid gap-2 text-[13px] text-ink-2 sm:grid-cols-2 xl:grid-cols-3">
        {(["account", "sessions", "consent", "requests", "assistant", "map"] as const).map((part) => (
          <li key={part} className="rounded-lg border border-line bg-subtle px-3 py-2">
            {t.dynamic(`myData.exportPart.${part}`)}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The user's own requests, to the workspace's admins or to the AkunMu operator. */
function RequestsPanel({ isAdmin }: { isAdmin: boolean }) {
  const { t, format } = useI18n();
  const notify = useToast();
  const fail = useFailure();
  const now = useNow();
  const requests = useApi<MyRequest[]>("/api/me/privacy-requests");
  const [draft, setDraft] = useState<NewRequest | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!draft) return;
    setSaving(true);
    setErrors({});
    try {
      const { message } = await api("/api/me/privacy-requests", { body: draft });
      notify(message);
      setDraft(null);
      requests.reload();
    } catch (error) {
      setErrors(firstFieldErrors(error));
      fail(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">{t("myData.requestsTitle")}</h2>
          <p className="text-[13px] text-muted">{t("myData.requestsHint")}</p>
        </div>
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setDraft({ recipient: isAdmin ? "platform" : "workspace", requestType: "access", description: "" })}>
          {t("myData.newRequest")}
        </Button>
      </div>
      {!requests.data ? (
        <div className="p-5">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : requests.data.length === 0 ? (
        <EmptyState icon={<Inbox className="size-6" />} title={t("myData.requestsEmpty")} description={t("myData.requestsEmptyHint")} />
      ) : (
        <ul className="divide-y divide-line">
          {requests.data.map((row) => (
            <li key={row.code} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-mono text-xs font-semibold text-muted">{row.code}</span>
                  <span className="block font-semibold text-ink">{t.dynamic(`privacyRequest.type.${row.requestType}`)}</span>
                  <span className="block text-xs text-muted">
                    {t.dynamic(`myData.recipient.${row.recipient}`)} · {format.dateTime(row.createdAt)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <DeadlineLabel deadline={row.deadlineAt} done={Boolean(row.closedAt)} now={now} />
                  <Badge tone={STATUS_TONES[row.status] ?? "neutral"}>{t.dynamic(`privacyRequest.status.${row.status}`)}</Badge>
                </span>
              </div>
              {row.response ? (
                <p className="mt-3 whitespace-pre-wrap rounded-lg border border-line bg-subtle p-3 text-[13px] text-ink">
                  <span className="mb-1 block text-xs font-semibold text-muted">{t("myData.answer")}</span>
                  {row.response}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Drawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={t("myData.newRequest")}
        description={t("myData.newRequestHint")}
        closeLabel={t("common.close")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void submit()} loading={saving}>
              {t("myData.send")}
            </Button>
          </div>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <Field label={t("myData.recipientLabel")} htmlFor="requestRecipient" hint={t.dynamic(`myData.recipientHint.${draft.recipient}`)}>
              <Select id="requestRecipient" value={draft.recipient} onChange={(event) => setDraft({ ...draft, recipient: event.target.value as PrivacyRequestRecipient })}>
                {PRIVACY_REQUEST_RECIPIENTS.map((recipient) => (
                  <option key={recipient} value={recipient}>
                    {t.dynamic(`myData.recipient.${recipient}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("privacyHub.requestType")} htmlFor="requestType" hint={t.dynamic(`myData.typeHint.${draft.requestType}`)}>
              <Select id="requestType" value={draft.requestType} onChange={(event) => setDraft({ ...draft, requestType: event.target.value as PrivacyRequestType })}>
                {PRIVACY_REQUEST_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t.dynamic(`privacyRequest.type.${type}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("myData.details")} htmlFor="requestDetails" optionalLabel={t("common.optional")} error={errors.description}>
              <Textarea id="requestDetails" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="min-h-28" maxLength={2000} />
            </Field>
            <Alert tone="info">{t("myData.deadlineNote")}</Alert>
          </div>
        ) : null}
      </Drawer>
    </Card>
  );
}

/** Erasure: the user's own account, or (admins) the whole workspace. Both need the typed confirmation. */
function DeletePanel({ email, workspaceSlug, isAdmin }: { email: string; workspaceSlug: string; isAdmin: boolean }) {
  const { t } = useI18n();
  const notify = useToast();
  const router = useRouter();
  const fail = useFailure();
  const [accountConfirm, setAccountConfirm] = useState("");
  const [workspaceConfirm, setWorkspaceConfirm] = useState("");
  const [busy, setBusy] = useState<"account" | "workspace" | null>(null);

  const erase = async (kind: "account" | "workspace") => {
    setBusy(kind);
    try {
      const path = kind === "account" ? "/api/me/account" : "/api/settings/workspace";
      const { message } = await api<{ redirectTo: string }>(path, { method: "DELETE", body: { confirmation: kind === "account" ? accountConfirm : workspaceConfirm } });
      notify(message);
      // The session is gone: leave the app and drop its cached pages.
      router.replace("/");
      router.refresh();
    } catch (error) {
      fail(error);
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Trash2 className="size-4 text-danger-ink" />
          {t("myData.deleteAccountTitle")}
        </h2>
        <p className="mt-1 text-[13px] text-muted">{t("myData.deleteAccountHint")}</p>
        {isAdmin ? (
          <Alert tone="info" className="mt-4">
            {t("myData.deleteAccountAdmin")}
          </Alert>
        ) : null}
        <Field label={t("myData.typeToConfirm", { value: email })} htmlFor="confirmAccount" className="mt-4">
          <Input id="confirmAccount" value={accountConfirm} onChange={(event) => setAccountConfirm(event.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
        <Button
          variant="danger"
          className="mt-3"
          disabled={accountConfirm.trim().toLowerCase() !== email.toLowerCase()}
          loading={busy === "account"}
          onClick={() => void erase("account")}
          icon={<Trash2 className="size-4" />}
        >
          {t("myData.deleteAccount")}
        </Button>
      </Card>
      {isAdmin ? (
        <Card className="border-danger-line p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <TriangleAlert className="size-4 text-danger-ink" />
            {t("myData.deleteWorkspaceTitle")}
          </h2>
          <p className="mt-1 text-[13px] text-muted">{t("myData.deleteWorkspaceHint")}</p>
          <Alert tone="danger" className="mt-4">
            {t("myData.deleteWorkspaceWarning")}
          </Alert>
          <Field label={t("myData.typeToConfirm", { value: workspaceSlug })} htmlFor="confirmWorkspace" className="mt-4">
            <Input id="confirmWorkspace" value={workspaceConfirm} onChange={(event) => setWorkspaceConfirm(event.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <Button
            variant="danger"
            className="mt-3"
            disabled={!workspaceSlug || workspaceConfirm.trim().toLowerCase() !== workspaceSlug.toLowerCase()}
            loading={busy === "workspace"}
            onClick={() => void erase("workspace")}
            icon={<TriangleAlert className="size-4" />}
          >
            {t("myData.deleteWorkspace")}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}

/** Settings → My data: one section per right in a side list, so nothing needs a long scroll. */
export function MyData({ email, workspaceSlug, isAdmin, initialTab }: { email: string; workspaceSlug: string; isAdmin: boolean; initialTab: string | null }) {
  const { t } = useI18n();
  const [tab, setTab] = useUrlTab(TABS, initialTab as Tab | null);
  const tabs: TabItem<Tab>[] = [
    { key: "consent", label: t("myData.tabConsent"), icon: <FileCheck2 className="size-4" /> },
    { key: "export", label: t("myData.tabExport"), icon: <Download className="size-4" /> },
    { key: "requests", label: t("myData.tabRequests"), icon: <Inbox className="size-4" /> },
    { key: "delete", label: t("myData.tabDelete"), icon: <Trash2 className="size-4" /> },
  ];
  return (
    <SideTabs tabs={tabs} active={tab} onSelect={setTab}>
      <div role="tabpanel">
        {tab === "consent" ? <ConsentPanel /> : null}
        {tab === "export" ? <ExportPanel /> : null}
        {tab === "requests" ? <RequestsPanel isAdmin={isAdmin} /> : null}
        {tab === "delete" ? <DeletePanel email={email} workspaceSlug={workspaceSlug} isAdmin={isAdmin} /> : null}
      </div>
    </SideTabs>
  );
}
