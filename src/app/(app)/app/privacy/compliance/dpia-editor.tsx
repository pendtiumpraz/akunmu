"use client";

import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { DPIA_CRITERIA, type DpiaCriterion } from "@/modules/compliance/catalog";
import type { DpiaView } from "@/modules/compliance/dpia";
import { CONTROL_NAMES, RISK_CATEGORIES, TREATMENTS, inherentRisk, residualRisk, summarizeRisks, type Score3 } from "@/modules/compliance/risk";
import { DPIA_DECISIONS, DPIA_STATUSES, type DpiaRisk, type DpiaSignoff, type DpiaTextField } from "@/modules/compliance/types";
import { api, ApiClientError, type Json } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { LOCALES } from "@/shared/i18n/locales";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
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

type View = Json<DpiaView>;
type RiskRow = Json<DpiaView>["risks"][number];

const SECTIONS = ["threshold", "context", "necessity", "risks", "measures", "dpo", "conclusion"] as const;
type Section = (typeof SECTIONS)[number];

const LEVEL_STYLES: Record<number, string> = {
  1: "bg-ok-soft text-ok-ink ring-ok-line",
  2: "bg-ok-soft text-ok-ink ring-ok-line",
  3: "bg-warn-soft text-warn-ink ring-warn-line",
  4: "bg-danger-soft text-danger-ink ring-danger-line",
  5: "bg-danger-soft text-danger-ink ring-danger-line",
};

function newRisk(): RiskRow {
  return {
    id: Math.random().toString(36).slice(2, 10),
    category: "authorization",
    event: {},
    mitigation: {},
    impact: null,
    likelihood: null,
    control: null,
    treatment: "mitigate",
    owner: "",
    dueDate: null,
    eventText: "",
    mitigationText: "",
    inherent: null,
    residual: null,
  };
}

export function DpiaEditor({ area, recordKey, initialSection }: { area: ComplianceArea; recordKey: string; initialSection: string | null }) {
  const { t, locale } = useI18n();
  const notify = useToast();
  const router = useRouter();
  const [language, setLanguage] = useState<string>(locale);
  const path = `${area.api}/dpia/${encodeURIComponent(recordKey)}`;
  const loaded = useApi<View>(`${path}?lang=${language}`);
  const [section, setSection] = useUrlTab(SECTIONS, initialSection as Section | null, "section");
  const [threshold, setThreshold] = useState<Partial<Record<DpiaCriterion, { answer: "yes" | "no" | null; note: string }>>>({});
  const [texts, setTexts] = useState<Partial<Record<DpiaTextField, string>>>({});
  const [risks, setRisks] = useState<RiskRow[] | null>(null);
  const [signoff, setSignoff] = useState<DpiaSignoff>({});
  const [decision, setDecision] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const view = loaded.data;
  const readOnly = !area.canManage;
  const dirty = Object.keys(threshold).length > 0 || Object.keys(texts).length > 0 || risks !== null || Object.keys(signoff).length > 0 || decision !== null || status !== null;

  const reset = () => {
    setThreshold({});
    setTexts({});
    setRisks(null);
    setSignoff({});
    setDecision(null);
    setStatus(null);
  };

  const switchLanguage = (code: string) => {
    if (dirty && !window.confirm(t("privacyHub.discardChanges"))) return;
    reset();
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

  const rows = risks ?? view.risks;
  const currentSignoff = { ...view.signoff, ...signoff };
  const thresholdOf = (criterion: DpiaCriterion) => threshold[criterion] ?? { answer: view.threshold[criterion].answer, note: view.threshold[criterion].note };
  const textOf = (field: DpiaTextField) => texts[field] ?? view.texts[field].value;
  const summary = summarizeRisks(rows);
  const yesCount = DPIA_CRITERIA.filter((criterion) => thresholdOf(criterion).answer === "yes").length;
  const answered = DPIA_CRITERIA.filter((criterion) => thresholdOf(criterion).answer !== null).length;

  const updateRisk = (index: number, patch: Partial<RiskRow>) => {
    const next = rows.map((row, position) => (position === index ? { ...row, ...patch } : row));
    setRisks(next);
  };
  const setRiskText = (index: number, field: "event" | "mitigation", value: string) => {
    const row = rows[index];
    const textField = field === "event" ? "eventText" : "mitigationText";
    updateRisk(index, { [field]: { ...(row[field] as Record<string, string>), [language]: value }, [textField]: value } as Partial<RiskRow>);
  };

  const save = async () => {
    setSaving(true);
    const textPayload: Record<string, Record<string, string> | null> = {};
    for (const [field, value] of Object.entries(texts) as [DpiaTextField, string][]) {
      const current = { ...(view.texts[field].override as Record<string, string>) };
      if (value.trim() === "" || value.trim() === view.texts[field].defaultValue.trim()) delete current[language];
      else current[language] = value;
      textPayload[field] = Object.keys(current).length > 0 ? current : null;
    }
    const body: Record<string, unknown> = { texts: textPayload };
    if (Object.keys(threshold).length > 0) body.threshold = threshold;
    if (risks) {
      body.risks = risks.map((row): Omit<DpiaRisk, "id"> & { id: string } => ({
        id: row.id,
        templateId: row.templateId,
        category: row.category,
        event: row.event as Record<string, string>,
        mitigation: row.mitigation as Record<string, string>,
        impact: row.impact,
        likelihood: row.likelihood,
        control: row.control,
        treatment: row.treatment,
        owner: row.owner ?? "",
        dueDate: row.dueDate || null,
      }));
    }
    if (Object.keys(signoff).length > 0) body.signoff = signoff;
    if (decision !== null) body.decision = decision === "" ? null : decision;
    if (status !== null) body.status = status;
    try {
      const { message } = await api(path, { method: "PATCH", body });
      notify(message);
      reset();
      loaded.reload();
    } catch (error) {
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(false);
    try {
      const { message } = await api(path, { method: "DELETE" });
      notify(message);
      router.push(`${area.pages}?tab=dpia`);
    } catch (error) {
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    }
  };

  const textArea = (field: DpiaTextField, rows = 5) => (
    <Field
      key={field}
      label={
        <span className="flex items-center gap-2">
          {t.dynamic(`privacyHub.dpiaField.${field}`)}
          {view.texts[field].override[language] || texts[field] !== undefined ? <Badge tone="accent">{t("privacyHub.edited")}</Badge> : null}
        </span>
      }
      htmlFor={`dpia-${field}`}
      hint={t.has(`privacyHub.dpiaFieldHint.${field}`) ? t.dynamic(`privacyHub.dpiaFieldHint.${field}`) : undefined}
    >
      <Textarea id={`dpia-${field}`} rows={rows} value={textOf(field)} disabled={readOnly} lang={language} onChange={(event) => setTexts({ ...texts, [field]: event.target.value })} className="min-h-0" />
    </Field>
  );

  const scoreSelect = (value: number | null, max: number, onChange: (value: number | null) => void, label: string, names?: Record<number, string>) => (
    <Select fullWidth={false} aria-label={label} value={value ?? ""} disabled={readOnly} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} className="h-9 w-full text-xs">
      <option value="">—</option>
      {Array.from({ length: max }, (_, index) => index + 1).map((score) => (
        <option key={score} value={score}>
          {names ? `${score} · ${names[score]}` : score}
        </option>
      ))}
    </Select>
  );

  const body: Record<Section, ReactNode> = {
    threshold: (
      <>
        <Alert tone={yesCount > 0 ? "warning" : answered === DPIA_CRITERIA.length ? "success" : "info"}>
          {yesCount > 0
            ? t("complianceDoc.thresholdRequired", { count: yesCount, total: DPIA_CRITERIA.length })
            : answered === DPIA_CRITERIA.length
              ? t("complianceDoc.thresholdOptional")
              : t("complianceDoc.thresholdPending", { count: DPIA_CRITERIA.length - answered })}
        </Alert>
        <div className="space-y-2">
          {DPIA_CRITERIA.map((criterion, index) => {
            const entry = thresholdOf(criterion);
            return (
              <div key={criterion} className="rounded-xl border border-line p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <p className="text-sm text-ink">
                    <span className="mr-1 font-semibold text-muted">{index + 1}.</span>
                    {t.dynamic(`compliance.criterion.${criterion}`)}
                    {view.threshold[criterion].suggested ? <Badge tone="warn" className="ml-2">{t("privacyHub.suggestedByRopa")}</Badge> : null}
                  </p>
                  <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={t.dynamic(`compliance.criterion.${criterion}`)}>
                    {(["yes", "no"] as const).map((answer) => (
                      <button
                        key={answer}
                        type="button"
                        role="radio"
                        aria-checked={entry.answer === answer}
                        disabled={readOnly}
                        onClick={() => setThreshold({ ...threshold, [criterion]: { ...entry, answer: entry.answer === answer ? null : answer } })}
                        className={cn(
                          "rounded-lg px-3 py-1 text-xs font-semibold ring-1",
                          entry.answer === answer ? (answer === "yes" ? "bg-warn-soft text-warn-ink ring-warn" : "bg-ink text-surface ring-ink") : "bg-surface text-muted ring-line hover:bg-subtle",
                        )}
                      >
                        {answer === "yes" ? t("common.yes") : t("common.no")}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  className="mt-2 h-9 text-xs"
                  placeholder={t("privacyHub.noteOptional")}
                  value={entry.note}
                  disabled={readOnly}
                  onChange={(event) => setThreshold({ ...threshold, [criterion]: { ...entry, note: event.target.value } })}
                />
              </div>
            );
          })}
        </div>
      </>
    ),
    context: (
      <>
        {textArea("description", 7)}
        {textArea("interests", 3)}
      </>
    ),
    necessity: (
      <>
        {textArea("necessity", 5)}
        {textArea("proportionality", 5)}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("complianceDoc.timing")} htmlFor="dpia-timing">
            <Select id="dpia-timing" value={currentSignoff.timing ?? "review"} disabled={readOnly} onChange={(event) => setSignoff({ ...signoff, timing: event.target.value as "before" | "review" })}>
              <option value="before">{t("complianceDoc.timingValue.before")}</option>
              <option value="review">{t("complianceDoc.timingValue.review")}</option>
            </Select>
          </Field>
          <Field label={t("complianceDoc.consultation")} htmlFor="dpia-consultation">
            <Select id="dpia-consultation" value={currentSignoff.consultation ?? "no"} disabled={readOnly} onChange={(event) => setSignoff({ ...signoff, consultation: event.target.value as "yes" | "no" })}>
              <option value="no">{t("complianceDoc.consultationValue.no")}</option>
              <option value="yes">{t("complianceDoc.consultationValue.yes")}</option>
            </Select>
          </Field>
        </div>
        {textArea("consultationReason", 3)}
      </>
    ),
    risks: (
      <>
        <p className="text-xs text-muted">{t("complianceDoc.methodText")}</p>
        <div className="space-y-3">
          {rows.map((row, index) => {
            const inherent = inherentRisk(row.impact, row.likelihood);
            const residual = residualRisk(inherent?.level, row.control);
            return (
              <div key={row.id} className="rounded-xl border border-line p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-xs font-semibold text-muted">{index + 1}</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="grid gap-2 md:grid-cols-[14rem_minmax(0,1fr)]">
                      <Select aria-label={t("complianceDoc.category")} value={row.category} disabled={readOnly} onChange={(event) => updateRisk(index, { category: event.target.value as RiskRow["category"] })} className="h-9 text-xs">
                        {RISK_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {t.dynamic(`compliance.riskCategory.${category}`)}
                          </option>
                        ))}
                      </Select>
                      <Textarea aria-label={t("complianceDoc.riskEvent")} rows={2} value={row.eventText} placeholder={t("complianceDoc.riskEvent")} disabled={readOnly} onChange={(event) => setRiskText(index, "event", event.target.value)} className="min-h-0 text-sm" lang={language} />
                    </div>
                    <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
                      <label className="space-y-1 text-[11px] font-medium text-muted">
                        <span>{t("privacyHub.impact")}</span>
                        {scoreSelect(row.impact, 5, (value) => updateRisk(index, { impact: value }), t("privacyHub.impact"))}
                      </label>
                      <label className="space-y-1 text-[11px] font-medium text-muted">
                        <span>{t("privacyHub.likelihood")}</span>
                        {scoreSelect(row.likelihood, 5, (value) => updateRisk(index, { likelihood: value }), t("privacyHub.likelihood"))}
                      </label>
                      <div className="space-y-1 text-[11px] font-medium text-muted">
                        <span>{t("complianceDoc.inherent")}</span>
                        <span className={cn("flex h-9 items-center rounded-lg px-2 text-xs font-semibold ring-1", inherent ? LEVEL_STYLES[inherent.level] : "bg-subtle text-muted ring-line")}>{inherent?.name ?? "—"}</span>
                      </div>
                      <label className="space-y-1 text-[11px] font-medium text-muted">
                        <span>{t("complianceDoc.control")}</span>
                        {scoreSelect(row.control, 3, (value) => updateRisk(index, { control: value }), t("complianceDoc.control"), CONTROL_NAMES as Record<Score3, string>)}
                      </label>
                      <div className="space-y-1 text-[11px] font-medium text-muted">
                        <span>{t("complianceDoc.residual")}</span>
                        <span className={cn("flex h-9 items-center rounded-lg px-2 text-xs font-semibold ring-1", residual ? (residual.status === "minimal" ? LEVEL_STYLES[1] : LEVEL_STYLES[4]) : "bg-subtle text-muted ring-line")}>
                          {residual ? `${residual.value} · ${residual.name}` : "—"}
                        </span>
                      </div>
                      <label className="space-y-1 text-[11px] font-medium text-muted">
                        <span>{t("complianceDoc.treatment")}</span>
                        <Select aria-label={t("complianceDoc.treatment")} value={row.treatment ?? ""} disabled={readOnly} onChange={(event) => updateRisk(index, { treatment: (event.target.value || null) as RiskRow["treatment"] })} className="h-9 text-xs">
                          <option value="">—</option>
                          {TREATMENTS.map((treatment) => (
                            <option key={treatment} value={treatment}>
                              {t.dynamic(`compliance.treatment.${treatment}`)}
                            </option>
                          ))}
                        </Select>
                      </label>
                    </div>
                  </div>
                  {!readOnly ? (
                    <button type="button" onClick={() => setRisks(rows.filter((_, position) => position !== index))} aria-label={t("common.delete")} className="rounded-lg p-2 text-faint hover:bg-danger-soft hover:text-danger-ink">
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {!readOnly ? (
          <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setRisks([...rows, newRisk()])}>
            {t("privacyHub.addRisk")}
          </Button>
        ) : null}
      </>
    ),
    measures: (
      <>
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.id} className="rounded-xl border border-line p-3">
              <p className="text-sm font-medium text-ink">
                <span className="mr-1 text-muted">{index + 1}.</span>
                {row.eventText || t.dynamic(`compliance.riskCategory.${row.category}`)}
              </p>
              <Textarea aria-label={t("complianceDoc.mitigation")} rows={2} className="mt-2 min-h-0 text-sm" value={row.mitigationText} placeholder={t("complianceDoc.mitigation")} disabled={readOnly} lang={language} onChange={(event) => setRiskText(index, "mitigation", event.target.value)} />
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input aria-label={t("complianceDoc.owner")} className="h-9 text-xs" placeholder={t("complianceDoc.owner")} value={row.owner ?? ""} disabled={readOnly} onChange={(event) => updateRisk(index, { owner: event.target.value })} />
                <Input aria-label={t("complianceDoc.dueDate")} className="h-9 text-xs" type="date" value={row.dueDate ?? ""} disabled={readOnly} onChange={(event) => updateRisk(index, { dueDate: event.target.value || null })} />
              </div>
            </div>
          ))}
        </div>
        {textArea("measures", 6)}
      </>
    ),
    dpo: (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("privacyHub.dpoName")} htmlFor="dpia-dpo">
            <Input id="dpia-dpo" value={currentSignoff.dpoName ?? ""} disabled={readOnly} onChange={(event) => setSignoff({ ...signoff, dpoName: event.target.value })} />
          </Field>
          <Field label={t("complianceDoc.dpoReviewedAt")} htmlFor="dpia-dpo-date">
            <Input id="dpia-dpo-date" type="date" value={currentSignoff.dpoReviewedAt ?? ""} disabled={readOnly} onChange={(event) => setSignoff({ ...signoff, dpoReviewedAt: event.target.value })} />
          </Field>
        </div>
        {textArea("dpoAdvice", 6)}
      </>
    ),
    conclusion: (
      <>
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-subtle p-4 text-sm">
          <span className="font-medium text-ink">{t("complianceDoc.finalRisk")}</span>
          <RiskPill level={summary.overall} />
          <span className="text-muted">{t("privacyHub.mitigateCount", { count: summary.toMitigate, total: summary.scored })}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("complianceDoc.decision")} htmlFor="dpia-decision">
            <Select id="dpia-decision" value={decision ?? view.decision ?? ""} disabled={readOnly} onChange={(event) => setDecision(event.target.value)}>
              <option value="">{t("complianceDoc.noDecision")}</option>
              {DPIA_DECISIONS.map((value) => (
                <option key={value} value={value}>
                  {t.dynamic(`compliance.decision.${value}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("complianceDoc.nextReview")} htmlFor="dpia-next">
            <Input id="dpia-next" type="date" value={currentSignoff.nextReviewAt ?? ""} disabled={readOnly} onChange={(event) => setSignoff({ ...signoff, nextReviewAt: event.target.value })} />
          </Field>
        </div>
        {textArea("recommendation", 4)}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("complianceDoc.preparedBy")} htmlFor="dpia-prepared">
            <Input id="dpia-prepared" value={currentSignoff.preparedBy ?? ""} disabled={readOnly} onChange={(event) => setSignoff({ ...signoff, preparedBy: event.target.value })} />
          </Field>
          <Field label={t("complianceDoc.date")} htmlFor="dpia-prepared-at">
            <Input id="dpia-prepared-at" type="date" value={currentSignoff.preparedAt ?? ""} disabled={readOnly} onChange={(event) => setSignoff({ ...signoff, preparedAt: event.target.value })} />
          </Field>
          <Field label={t("complianceDoc.approvedBy")} htmlFor="dpia-approver">
            <Input id="dpia-approver" value={currentSignoff.approverName ?? ""} disabled={readOnly} onChange={(event) => setSignoff({ ...signoff, approverName: event.target.value })} />
          </Field>
          <Field label={t("complianceDoc.date")} htmlFor="dpia-approved-at">
            <Input id="dpia-approved-at" type="date" value={currentSignoff.approvedAt ?? ""} disabled={readOnly} onChange={(event) => setSignoff({ ...signoff, approvedAt: event.target.value })} />
          </Field>
        </div>
        <Field label={t("complianceDoc.dpiaStatus")} htmlFor="dpia-status" hint={t("privacyHub.statusHint")}>
          <Select id="dpia-status" value={status ?? view.status} disabled={readOnly} onChange={(event) => setStatus(event.target.value)}>
            {DPIA_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t.dynamic(`compliance.dpiaStatus.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
      </>
    ),
  };

  return (
    <div>
      <Link href={`${area.pages}?tab=dpia`} className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        {t("privacyHub.backToDpia")}
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-muted">
            {view.code} ·{" "}
            <Link href={`${area.pages}/ropa/${encodeURIComponent(view.key)}`} className="hover:underline">
              {view.ropaCode}
            </Link>
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{view.activityName}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={view.status === "approved" ? "ok" : view.status === "review" ? "accent" : "neutral"}>{t.dynamic(`compliance.dpiaStatus.${view.status}`)}</Badge>
            <RiskPill level={view.summary.overall} />
            <Badge tone="neutral">{t("privacyHub.versionLine", { version: view.version })}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DocumentDownloads href={`${path}/document`} />
          {!readOnly ? (
            <>
              <Button variant="ghost" size="sm" icon={<Trash2 className="size-4 text-danger-ink" />} onClick={() => setDeleting(true)}>
                {t("common.delete")}
              </Button>
              <Button size="sm" onClick={() => void save()} loading={saving} disabled={!dirty}>
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
          tabs={SECTIONS.map((key, index) => ({
            key,
            label: `${index + 1}. ${t.dynamic(`privacyHub.dpiaSection.${key}`)}`,
            attention: key === "threshold" ? answered < DPIA_CRITERIA.length : key === "risks" ? summary.scored < rows.length || rows.length === 0 : key === "dpo" ? !currentSignoff.dpoName : false,
          }))}
          active={section}
          onSelect={setSection}
        >
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink">{t.dynamic(`privacyHub.dpiaSection.${section}`)}</h2>
            <p className="mt-0.5 text-xs text-muted">{t.dynamic(`privacyHub.dpiaSectionRef.${section}`)}</p>
            <div className="mt-5 space-y-5">{body[section]}</div>
          </Card>
        </SideTabs>
      </div>
      <ConfirmDialog
        open={deleting}
        title={t("privacyHub.deleteTitle")}
        description={t("privacyHub.deleteBody")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(false)}
      />
    </div>
  );
}
