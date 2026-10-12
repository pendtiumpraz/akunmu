"use client";

import { ArrowLeft, CheckCheck, FileCheck2, RotateCcw, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { DPIA_CRITERIA, type DpiaCriterion } from "@/modules/compliance/catalog";
import type { RopaView } from "@/modules/compliance/ropa";
import { RECORD_STATUSES, type RopaAssignment, type RopaField } from "@/modules/compliance/types";
import { api, ApiClientError, type Json } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { LOCALES } from "@/shared/i18n/locales";
import { Badge } from "@/shared/ui/badge";
import { Button, buttonClasses } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { cn } from "@/shared/ui/cn";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { Alert, ErrorState, Skeleton } from "@/shared/ui/feedback";
import { Field, Input, Select, Textarea } from "@/shared/ui/form-controls";
import { SideTabs, useUrlTab } from "@/shared/ui/tabs";
import { useApi } from "@/shared/ui/use-api";
import { useToast } from "@/shared/ui/toast";
import type { ComplianceArea } from "./area";
import { DocumentDownloads, RiskPill } from "./shared";

type View = Json<RopaView>;

const SECTIONS = ["description", "parties", "purpose", "data", "systems", "recipients", "rights", "flow", "retention", "security", "risk"] as const;
type Section = (typeof SECTIONS)[number];

/** Fields edited in each section; list fields take one item per line. */
const SECTION_FIELDS: Record<Section, RopaField[]> = {
  description: ["name", "description"],
  parties: [],
  purpose: ["purpose", "processing", "legalBasis"],
  data: ["dataGeneral", "dataSpecific", "subjects", "volume", "source"],
  systems: ["systems", "automatedDecision", "profiling"],
  recipients: ["recipientsInternal", "recipientsExternal", "transfer"],
  rights: ["rights"],
  flow: ["flow"],
  retention: ["retention", "deletion"],
  security: ["security"],
  risk: ["notes"],
};

const asText = (value: string | string[]) => (Array.isArray(value) ? value.join("\n") : value);

type CriterionChoice = "auto" | "yes" | "no";

export function RopaEditor({ area, recordKey, initialSection, profileHref }: { area: ComplianceArea; recordKey: string; initialSection: string | null; profileHref: string }) {
  const { t, locale, format } = useI18n();
  const notify = useToast();
  const router = useRouter();
  const [language, setLanguage] = useState<string>(locale);
  const path = `${area.api}/ropa/${encodeURIComponent(recordKey)}`;
  const loaded = useApi<View>(`${path}?lang=${language}`);
  const [section, setSection] = useUrlTab(SECTIONS, initialSection as Section | null, "section");
  const [edits, setEdits] = useState<Partial<Record<RopaField, string>>>({});
  const [assignment, setAssignment] = useState<RopaAssignment | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [criteria, setCriteria] = useState<Partial<Record<DpiaCriterion, CriterionChoice>>>({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<"reset" | "delete" | null>(null);

  const view = loaded.data;
  const dirty = Object.keys(edits).length > 0 || assignment !== null || status !== null || Object.keys(criteria).length > 0;
  const readOnly = !area.canManage;

  const switchLanguage = (code: string) => {
    if (dirty && !window.confirm(t("privacyHub.discardChanges"))) return;
    setEdits({});
    setAssignment(null);
    setStatus(null);
    setCriteria({});
    setLanguage(code);
  };

  if (loaded.error && !view) {
    return (
      <Card>
        <ErrorState title={t("common.loadFailed")} retryLabel={t("common.retry")} onRetry={loaded.reload} />
      </Card>
    );
  }
  if (!view) return <Skeleton className="h-[480px] w-full rounded-panel" />;

  const valueOf = (field: RopaField) => edits[field] ?? asText(view.fields[field].value);
  const overridden = (field: RopaField) => Boolean(view.fields[field].override[language]) || edits[field] !== undefined;

  const save = async (extra: Record<string, unknown> = {}) => {
    setSaving(true);
    const overrides: Record<string, Record<string, string> | null> = {};
    for (const [field, value] of Object.entries(edits) as [RopaField, string][]) {
      const current = { ...(view.fields[field].override as Record<string, string>) };
      const isDefault = value.trim() === asText(view.fields[field].defaultValue).trim();
      if (isDefault || value.trim() === "") delete current[language];
      else current[language] = value;
      overrides[field] = Object.keys(current).length > 0 ? current : null;
    }
    const criteriaPayload = Object.fromEntries(Object.entries(criteria).map(([key, choice]) => [key, choice === "auto" ? null : choice === "yes"]));
    try {
      const { message } = await api(path, {
        method: "PATCH",
        body: {
          overrides,
          ...(Object.keys(criteriaPayload).length > 0 ? { criteria: criteriaPayload } : {}),
          ...(assignment ? { assignment } : {}),
          ...(status ? { status } : {}),
          ...extra,
        },
      });
      notify(message);
      setEdits({});
      setAssignment(null);
      setStatus(null);
      setCriteria({});
      loaded.reload();
    } catch (error) {
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const resetField = (field: RopaField) => setEdits({ ...edits, [field]: asText(view.fields[field].defaultValue) });

  const runConfirm = async () => {
    const kind = confirm;
    setConfirm(null);
    try {
      if (kind === "reset") {
        const { message } = await api(`${path}/reset`, { method: "POST" });
        notify(message);
        setEdits({});
        loaded.reload();
      } else if (kind === "delete") {
        const { message } = await api(path, { method: "DELETE" });
        notify(message);
        router.push(`${area.pages}?tab=ropa`);
      }
    } catch (error) {
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    }
  };

  const fieldEditor = (field: RopaField): ReactNode => {
    const list = ["dataGeneral", "dataSpecific", "subjects", "recipientsInternal", "recipientsExternal", "security", "rights", "flow", "systems"].includes(field);
    const value = valueOf(field);
    const rows = Math.min(14, Math.max(field === "name" ? 1 : 3, value.split("\n").length + 1));
    return (
      <Field
        key={field}
        label={
          <span className="flex items-center gap-2">
            {t.dynamic(`privacyHub.field.${field}`)}
            {overridden(field) ? <Badge tone="accent">{t("privacyHub.edited")}</Badge> : null}
            {view.missing.includes(field) ? <Badge tone="warn">{t("privacyHub.needsInput")}</Badge> : null}
          </span>
        }
        htmlFor={`ropa-${field}`}
        hint={list ? t("privacyHub.onePerLine") : t.has(`privacyHub.fieldHint.${field}`) ? t.dynamic(`privacyHub.fieldHint.${field}`) : undefined}
      >
        <div className="relative">
          {field === "name" ? (
            <Input id={`ropa-${field}`} value={value} disabled={readOnly} onChange={(event) => setEdits({ ...edits, [field]: event.target.value })} lang={language} />
          ) : (
            <Textarea id={`ropa-${field}`} value={value} rows={rows} disabled={readOnly} onChange={(event) => setEdits({ ...edits, [field]: event.target.value })} lang={language} className="min-h-0" />
          )}
          {!readOnly && view.kind !== "custom" && overridden(field) ? (
            <button type="button" onClick={() => resetField(field)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              <Undo2 className="size-3" />
              {t("privacyHub.useDefault")}
            </button>
          ) : null}
        </div>
      </Field>
    );
  };

  const currentAssignment = assignment ?? view.assignment;
  const setAssign = (patch: RopaAssignment) => setAssignment({ ...currentAssignment, ...patch });
  const choiceOf = (criterion: DpiaCriterion): CriterionChoice => {
    if (criteria[criterion]) return criteria[criterion]!;
    const entry = view.criteria.find((item) => item.criterion === criterion);
    return entry?.source === "staff" ? (entry.met ? "yes" : "no") : "auto";
  };

  const sectionBody: Record<Section, ReactNode> = {
    description: (
      <>
        {SECTION_FIELDS.description.map(fieldEditor)}
        <Field label={t("complianceDoc.recordStatus")} htmlFor="ropa-status">
          <Select id="ropa-status" value={status ?? view.status} disabled={readOnly} onChange={(event) => setStatus(event.target.value)}>
            {RECORD_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t.dynamic(`compliance.status.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
      </>
    ),
    parties: (
      <>
        <Alert tone="info">
          {t("privacyHub.partiesFromProfile")}{" "}
          <Link href={profileHref} className="font-semibold underline">
            {t("privacyHub.openSettings")}
          </Link>
        </Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["picName", "picRole", "picEmail", "unit"] as const).map((key) => (
            <Field key={key} label={t.dynamic(`privacyHub.assignment.${key}`)} htmlFor={`ropa-${key}`} hint={t("privacyHub.assignmentHint")}>
              <Input id={`ropa-${key}`} type={key === "picEmail" ? "email" : "text"} value={currentAssignment[key] ?? ""} disabled={readOnly} onChange={(event) => setAssign({ [key]: event.target.value })} />
            </Field>
          ))}
        </div>
      </>
    ),
    purpose: SECTION_FIELDS.purpose.map(fieldEditor),
    data: SECTION_FIELDS.data.map(fieldEditor),
    systems: (
      <>
        {SECTION_FIELDS.systems.map(fieldEditor)}
        {view.kind !== "processor" ? (
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium text-ink-2">{t("complianceDoc.criteria")}</legend>
            <p className="text-xs text-muted">{t("privacyHub.criteriaHint")}</p>
            {DPIA_CRITERIA.map((criterion) => {
              const entry = view.criteria.find((item) => item.criterion === criterion);
              return (
                <div key={criterion} className="flex flex-col gap-2 rounded-xl border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 text-sm text-ink">
                    {t.dynamic(`compliance.criterion.${criterion}`)}
                    {entry?.met ? <Badge tone="warn" className="ml-2">{t("privacyHub.met")}</Badge> : null}
                  </span>
                  <Select
                    fullWidth={false}
                    value={choiceOf(criterion)}
                    disabled={readOnly}
                    onChange={(event) => setCriteria({ ...criteria, [criterion]: event.target.value as CriterionChoice })}
                    aria-label={t.dynamic(`compliance.criterion.${criterion}`)}
                  >
                    <option value="auto">{entry?.source && entry.source !== "staff" ? t("privacyHub.criterionAutoYes") : t("privacyHub.criterionAuto")}</option>
                    <option value="yes">{t("common.yes")}</option>
                    <option value="no">{t("common.no")}</option>
                  </Select>
                </div>
              );
            })}
          </fieldset>
        ) : null}
      </>
    ),
    recipients: SECTION_FIELDS.recipients.map(fieldEditor),
    rights: SECTION_FIELDS.rights.map(fieldEditor),
    flow: (
      <>
        <Alert tone="info">{t("privacyHub.flowHint")}</Alert>
        {SECTION_FIELDS.flow.map(fieldEditor)}
      </>
    ),
    retention: (
      <>
        {SECTION_FIELDS.retention.map(fieldEditor)}
        <p className="text-xs text-muted">
          {t("privacyHub.retentionSettingsHint")}{" "}
          <Link href={profileHref} className="font-medium text-accent underline">
            {t("privacyHub.openSettings")}
          </Link>
        </p>
      </>
    ),
    security: SECTION_FIELDS.security.map(fieldEditor),
    risk: (
      <>
        {view.kind === "processor" ? (
          <Alert tone="info">{t("privacyHub.dpiaController")}</Alert>
        ) : view.dpia ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <FileCheck2 className="size-4 text-accent" />
              DPIA
              <Badge tone={view.dpia.status === "approved" ? "ok" : "accent"}>{t.dynamic(`compliance.dpiaStatus.${view.dpia.status}`)}</Badge>
              <RiskPill level={view.dpia.overall} />
            </span>
            <Link href={`${area.pages}/dpia/${encodeURIComponent(view.key)}`} className={buttonClasses("secondary", "sm")}>
              {t("privacyHub.openDpia")}
            </Link>
          </div>
        ) : (
          <Alert tone={view.dpiaRequired ? "warning" : "info"}>
            {view.dpiaRequired ? t("privacyHub.dpiaRequiredHint") : t("privacyHub.dpiaOptionalHint")}{" "}
            <Link href={`${area.pages}?tab=dpia`} className="font-semibold underline">
              {t("privacyHub.goToDpia")}
            </Link>
          </Alert>
        )}
        {SECTION_FIELDS.risk.map(fieldEditor)}
        <div className="rounded-xl bg-subtle p-4 text-xs text-muted">
          <p>{t("privacyHub.versionLine", { version: view.version })}</p>
          <p>{view.reviewedAt ? t("privacyHub.reviewedLine", { date: format.dateTime(view.reviewedAt) }) : t("complianceDoc.notReviewed")}</p>
        </div>
      </>
    ),
  };

  const attention = (key: Section) => SECTION_FIELDS[key].some((field) => view.missing.includes(field));

  return (
    <div>
      <Link href={`${area.pages}?tab=ropa`} className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        {t("privacyHub.backToRopa")}
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-muted">{view.code}</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{asText(view.fields.name.value)}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {view.kind === "processor" ? <Badge tone="accent">{t("privacyHub.kindProcessor")}</Badge> : null}
            {view.kind === "custom" ? <Badge tone="accent">{t("privacyHub.kindCustom")}</Badge> : null}
            <Badge tone={view.status === "active" ? "ok" : "neutral"}>{t.dynamic(`compliance.status.${view.status}`)}</Badge>
            {view.missing.length > 0 ? <Badge tone="warn">{t("privacyHub.missingCount", { count: view.missing.length })}</Badge> : <Badge tone="ok">{t("privacyHub.complete")}</Badge>}
            {view.stats.map((stat) => (
              <Badge key={stat.key} tone="neutral">
                {t.dynamic(`compliance.stat.${stat.key}`)}: {stat.total}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DocumentDownloads href={`${path}/document`} />
          {!readOnly ? (
            <>
              <Button variant="secondary" size="sm" icon={<CheckCheck className="size-4" />} onClick={() => void save({ reviewed: true })} loading={saving && !dirty}>
                {t("privacyHub.markReviewed")}
              </Button>
              {view.kind === "custom" ? (
                <Button variant="ghost" size="sm" icon={<Trash2 className="size-4 text-danger-ink" />} onClick={() => setConfirm("delete")}>
                  {t("common.delete")}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" />} onClick={() => setConfirm("reset")}>
                  {t("privacyHub.resetAll")}
                </Button>
              )}
              <Button size="sm" onClick={() => void save()} loading={saving && dirty} disabled={!dirty}>
                {t("common.saveChanges")}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl bg-subtle px-4 py-2.5 text-[13px] text-muted">
        <span className="font-medium">{t("privacyHub.editLanguage")}</span>
        {LOCALES.map((entry) => (
          <button
            key={entry.code}
            type="button"
            onClick={() => switchLanguage(entry.code)}
            className={cn("rounded-md px-2 py-0.5 text-xs font-semibold uppercase", language === entry.code ? "bg-primary text-on-primary" : "bg-surface text-muted ring-1 ring-line hover:bg-sunken")}
          >
            {entry.code}
          </button>
        ))}
        <span className="text-xs text-muted">{t("privacyHub.editLanguageHint")}</span>
      </div>

      <div className="mt-5">
        <SideTabs
          tabs={SECTIONS.map((key, index) => ({ key, label: `${["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"][index]}. ${t.dynamic(`privacyHub.section.${key}`)}`, attention: attention(key) }))}
          active={section}
          onSelect={setSection}
        >
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink">{t.dynamic(`privacyHub.section.${section}`)}</h2>
            <p className="mt-0.5 text-xs text-muted">{t.dynamic(`privacyHub.sectionRef.${section}`)}</p>
            <div className="mt-5 space-y-5">{sectionBody[section]}</div>
          </Card>
        </SideTabs>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "delete" ? t("privacyHub.deleteTitle") : t("privacyHub.resetTitle")}
        description={confirm === "delete" ? t("privacyHub.deleteBody") : t("privacyHub.resetBody")}
        confirmLabel={confirm === "delete" ? t("common.delete") : t("privacyHub.resetAll")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        onConfirm={() => void runConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
