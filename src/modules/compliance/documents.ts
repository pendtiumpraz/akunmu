import { EMPTY_VALUE, safeFileName, textOrEmpty, type ComplianceDocument, type DocumentField, type DocumentSection, type RiskTone } from "../../server/documents/model";
import { DPIA_CRITERIA } from "./catalog";
import type { DpiaView } from "./dpia";
import type { IncidentView } from "./incidents";
import { CONTROL_NAMES, OVERALL_TONE, RISK_LEVEL_NAMES, type OverallRisk, type Score3 } from "./risk";
import type { RopaContext, RopaView } from "./ropa";

/**
 * Builds the format-neutral documents (rendered to PDF and DOCX by src/server/documents): one RoPA record,
 * the platform's processor record, a DPIA, an incident report, and the full register. Section order follows
 * the Privasimu formats; legal references follow UU PDP and PP 33/2026 (Art. 74, 116, 120–122).
 */

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];

export type DocumentFrame = { accent: string; product: string; now?: Date };

type Builder = { context: RopaContext; frame: DocumentFrame };

const ENGLISH_TITLES = {
  ropa: "Record of Processing Activities",
  processor: "Record of Processing Activities (Processor)",
  dpia: "Data Protection Impact Assessment",
  incident: "Personal Data Breach Report",
  register: "Register of Processing Activities",
} as const;

function numbered(sections: Omit<DocumentSection, "number">[]): DocumentSection[] {
  return sections.map((section, index) => ({ ...section, number: ROMAN[index] ?? String(index + 1) }));
}

function list(value: string | string[]): string[] {
  return Array.isArray(value) ? value : value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function text(value: string | string[]): string {
  return Array.isArray(value) ? value.join("\n") : value;
}

function joinParts(parts: Array<string | null | undefined>, separator = " · "): string {
  return parts.map((part) => (part ?? "").trim()).filter(Boolean).join(separator);
}

function footer({ context, frame }: Builder): ComplianceDocument["footer"] {
  const now = frame.now ?? new Date();
  return {
    generated: context.t("complianceDoc.generated", { date: context.format.dateTime(now) }),
    pageTemplate: context.t("complianceDoc.pageOf"),
    product: frame.product,
  };
}

function overallBadge(context: RopaContext, overall: OverallRisk | null, required: boolean): { tone: RiskTone; text: string } {
  if (overall) return { tone: OVERALL_TONE[overall], text: context.t.dynamic(`compliance.overall.${overall}`) };
  return required ? { tone: 4, text: context.t("complianceDoc.dpiaRequiredMissing") } : { tone: 1, text: context.t("complianceDoc.noHighRisk") };
}

function controllerRows(context: RopaContext, profile = context.profile) {
  const { t } = context;
  return [
    { key: t("complianceDoc.name"), value: textOrEmpty(profile.legalName) },
    { key: t("complianceDoc.address"), value: textOrEmpty(profile.address) },
    { key: t("complianceDoc.email"), value: textOrEmpty(profile.email) },
    { key: t("complianceDoc.phone"), value: textOrEmpty(profile.phone) },
    { key: t("complianceDoc.website"), value: textOrEmpty(profile.website) },
  ];
}

function dpoText(context: RopaContext, profile = context.profile): string {
  const value = joinParts([profile.dpoName, profile.dpoEmail, profile.dpoPhone]);
  return value || context.t("complianceDoc.dpoMissing");
}

function flowTable(context: RopaContext, flow: string[]): DocumentField {
  return {
    label: context.t("complianceDoc.flow"),
    variant: "table",
    value: {
      columns: [
        { title: context.t("complianceDoc.no"), width: 6, align: "center" },
        { title: context.t("complianceDoc.stage"), width: 26 },
        { title: context.t("complianceDoc.detail"), width: 68 },
      ],
      rows: flow.map((line, index) => {
        const split = line.indexOf(":");
        return split > 0 ? [String(index + 1), line.slice(0, split).trim(), line.slice(split + 1).trim()] : [String(index + 1), line, EMPTY_VALUE];
      }),
    },
  };
}

function criteriaRows(context: RopaContext, view: RopaView) {
  return view.criteria.map((entry) => ({
    key: context.t.dynamic(`compliance.criterion.${entry.criterion}`),
    value: entry.met ? context.t("common.yes") : context.t("common.no"),
  }));
}

function ropaSections(builder: Builder, view: RopaView): DocumentSection[] {
  const { context } = builder;
  const { t, format } = context;
  const f = view.fields;
  const processor = view.kind === "processor";
  const operator = context.operator;
  const partiesSection: Omit<DocumentSection, "number"> = processor
    ? {
        title: t("complianceDoc.s.processorParties"),
        subtitle: t("complianceDoc.ref.processorParties"),
        fields: [
          { label: t("complianceDoc.processor"), variant: "kv", value: controllerRows(context, operator) },
          { label: t("complianceDoc.dpo"), variant: "text", value: dpoText(context, operator) },
          { label: t("complianceDoc.controllers"), variant: "text", value: t("complianceDoc.controllersValue", { count: format.number(view.stats[0]?.tenants ?? 0) }) },
        ],
      }
    : {
        title: t("complianceDoc.s.parties"),
        subtitle: t("complianceDoc.ref.parties"),
        fields: [
          { label: t("complianceDoc.controller"), variant: "kv", value: controllerRows(context) },
          { label: t("complianceDoc.jointController"), variant: "text", value: t("complianceDoc.none") },
          ...(context.scope === "tenant"
            ? [{ label: t("complianceDoc.processor"), variant: "text" as const, value: joinParts([operator.legalName, operator.email]) || EMPTY_VALUE }]
            : []),
          { label: t("complianceDoc.dpo"), variant: "text", value: dpoText(context) },
          {
            label: t("complianceDoc.pic"),
            variant: "text",
            value: joinParts([view.assignment.picName, view.assignment.picRole ? `(${view.assignment.picRole})` : "", view.assignment.picEmail], " ") || EMPTY_VALUE,
          },
          { label: t("complianceDoc.unit"), variant: "text", value: textOrEmpty(view.assignment.unit) },
        ],
      };

  const risk = overallBadge(context, view.dpia?.overall ?? null, view.dpiaRequired);
  return numbered([
    {
      title: t("complianceDoc.s.description"),
      subtitle: t("complianceDoc.ref.description"),
      fields: [
        { label: t("complianceDoc.code"), variant: "text", value: view.code },
        { label: t("complianceDoc.activityName"), variant: "text", value: text(f.name.value) },
        { label: t("complianceDoc.activityDescription"), variant: "longtext", value: text(f.description.value) },
        { label: t("complianceDoc.recordStatus"), variant: "text", value: t.dynamic(`compliance.status.${view.status}`) },
      ],
    },
    partiesSection,
    {
      title: t("complianceDoc.s.purpose"),
      subtitle: t("complianceDoc.ref.purpose"),
      fields: [
        { label: t("complianceDoc.purpose"), variant: "longtext", value: text(f.purpose.value) },
        { label: t("complianceDoc.processing"), variant: "longtext", value: text(f.processing.value) },
        { label: t("complianceDoc.legalBasis"), variant: "longtext", value: text(f.legalBasis.value) },
      ],
    },
    {
      title: t("complianceDoc.s.data"),
      subtitle: t("complianceDoc.ref.data"),
      fields: [
        { label: t("complianceDoc.dataGeneral"), variant: "pills", value: list(f.dataGeneral.value) },
        { label: t("complianceDoc.dataSpecific"), variant: "pills", value: list(f.dataSpecific.value) },
        { label: t("complianceDoc.subjects"), variant: "pills", value: list(f.subjects.value) },
        { label: t("complianceDoc.volume"), variant: "longtext", value: text(f.volume.value) },
        { label: t("complianceDoc.source"), variant: "longtext", value: text(f.source.value) },
      ],
    },
    {
      title: t("complianceDoc.s.systems"),
      subtitle: t("complianceDoc.ref.systems"),
      fields: [
        { label: t("complianceDoc.systems"), variant: "list", value: list(f.systems.value) },
        { label: t("complianceDoc.automatedDecision"), variant: "longtext", value: text(f.automatedDecision.value) },
        { label: t("complianceDoc.profiling"), variant: "text", value: text(f.profiling.value) },
        ...(processor ? [] : [{ label: t("complianceDoc.criteria"), variant: "kv" as const, value: criteriaRows(context, view) }]),
      ],
    },
    {
      title: t("complianceDoc.s.recipients"),
      subtitle: t("complianceDoc.ref.recipients"),
      fields: [
        { label: t("complianceDoc.recipientsInternal"), variant: "list", value: list(f.recipientsInternal.value) },
        { label: t("complianceDoc.recipientsExternal"), variant: "list", value: list(f.recipientsExternal.value) },
        { label: t("complianceDoc.transfer"), variant: "longtext", value: text(f.transfer.value) },
      ],
    },
    {
      title: t("complianceDoc.s.rights"),
      subtitle: t("complianceDoc.ref.rights"),
      fields: [{ label: t("complianceDoc.rights"), variant: "list", value: list(f.rights.value) }],
    },
    {
      title: t("complianceDoc.s.flow"),
      subtitle: t("complianceDoc.ref.flow"),
      fields: [flowTable(context, list(f.flow.value))],
    },
    {
      title: t("complianceDoc.s.retention"),
      subtitle: t("complianceDoc.ref.retention"),
      fields: [
        { label: t("complianceDoc.retention"), variant: "longtext", value: text(f.retention.value) },
        { label: t("complianceDoc.deletion"), variant: "longtext", value: text(f.deletion.value) },
      ],
    },
    {
      title: t("complianceDoc.s.security"),
      subtitle: t("complianceDoc.ref.security"),
      fields: [{ label: t("complianceDoc.security"), variant: "list", value: list(f.security.value) }],
    },
    ...(processor
      ? []
      : [
          {
            title: t("complianceDoc.s.risk"),
            subtitle: t("complianceDoc.ref.risk"),
            fields: [
              { label: t("complianceDoc.riskLevel"), variant: "risk" as const, value: risk },
              {
                label: t("complianceDoc.dpiaStatus"),
                variant: "text" as const,
                value: view.dpia ? t.dynamic(`compliance.dpiaStatus.${view.dpia.status}`) : view.dpiaRequired ? t("complianceDoc.dpiaNotStarted") : t("complianceDoc.dpiaNotRequired"),
              },
              ...(text(f.notes.value) ? [{ label: t("complianceDoc.notes"), variant: "longtext" as const, value: text(f.notes.value) }] : []),
            ],
          },
        ]),
    {
      title: t("complianceDoc.s.history"),
      subtitle: t("complianceDoc.ref.history"),
      fields: [
        {
          label: t("complianceDoc.history"),
          variant: "kv",
          value: [
            { key: t("complianceDoc.version"), value: String(view.version) },
            { key: t("complianceDoc.updatedAt"), value: view.updatedAt ? format.dateTime(view.updatedAt) : t("complianceDoc.notEdited") },
            { key: t("complianceDoc.reviewedAt"), value: view.reviewedAt ? format.dateTime(view.reviewedAt) : t("complianceDoc.notReviewed") },
          ],
        },
      ],
    },
  ]);
}

export function buildRopaDocument(builder: Builder, view: RopaView): ComplianceDocument {
  const { context, frame } = builder;
  const { t } = context;
  const processor = view.kind === "processor";
  const owner = processor ? context.operator : context.profile;
  return {
    kindLabel: "RoPA",
    title: processor ? t("complianceDoc.processorTitle") : t("complianceDoc.ropaTitle"),
    secondaryTitle: context.locale === "en" ? undefined : processor ? ENGLISH_TITLES.processor : ENGLISH_TITLES.ropa,
    subject: text(view.fields.name.value) || view.code,
    code: view.code,
    organization: owner.legalName || frame.product,
    summary: [
      { label: t("complianceDoc.code"), value: view.code },
      { label: t("complianceDoc.version"), value: String(view.version) },
      { label: t("complianceDoc.role"), value: processor ? t("complianceDoc.roleProcessor") : t("complianceDoc.roleController") },
      { label: t("complianceDoc.dpo"), value: dpoText(context, owner) },
      { label: t("complianceDoc.recordStatus"), value: t.dynamic(`compliance.status.${view.status}`) },
      { label: t("complianceDoc.updatedAt"), value: view.updatedAt ? context.format.dateTime(view.updatedAt) : t("complianceDoc.notEdited") },
    ],
    sections: ropaSections(builder, view),
    language: context.locale === "id" ? "id-ID" : context.locale,
    accent: frame.accent,
    footer: footer(builder),
    fileName: safeFileName(`${view.code}-${text(view.fields.name.value)}`),
  };
}

function thresholdResult(context: RopaContext, dpia: DpiaView): string {
  const yes = Object.values(dpia.threshold).filter((entry) => entry.answer === "yes").length;
  const answered = Object.values(dpia.threshold).filter((entry) => entry.answer !== null).length;
  if (yes > 0) return context.t("complianceDoc.thresholdRequired", { count: yes, total: DPIA_CRITERIA.length });
  if (answered === DPIA_CRITERIA.length) return context.t("complianceDoc.thresholdOptional");
  return context.t("complianceDoc.thresholdPending", { count: DPIA_CRITERIA.length - answered });
}

/** Residual ≤ 1 needs minimal action (green); 2 is medium; 3 and up must be mitigated (red). */
function residualTone(value: number): RiskTone {
  return value <= 1 ? 1 : value === 2 ? 3 : value === 3 ? 4 : 5;
}

function defaultRecommendation(context: RopaContext, overall: OverallRisk | null): string {
  return context.t.dynamic(`complianceDoc.recommendation.${overall ?? "low"}`);
}

export function buildDpiaDocument(builder: Builder, dpia: DpiaView, ropa: RopaView): ComplianceDocument {
  const { context, frame } = builder;
  const { t, format } = context;
  const answer = (value: "yes" | "no" | null) => (value === "yes" ? t("common.yes") : value === "no" ? t("common.no") : t("complianceDoc.unanswered"));
  const overall = dpia.summary.overall;
  const badge = overallBadge(context, overall, false);
  const control = (value: number | null) => (value ? CONTROL_NAMES[value as Score3] : EMPTY_VALUE);
  const sections = numbered([
    {
      title: t("complianceDoc.s.dpiaContext"),
      subtitle: t("complianceDoc.ref.dpiaContext"),
      fields: [
        { label: t("complianceDoc.activityName"), variant: "text", value: dpia.activityName },
        { label: t("complianceDoc.ropaCode"), variant: "text", value: dpia.ropaCode },
        { label: t("complianceDoc.dpiaDescription"), variant: "longtext", value: dpia.texts.description.value },
        { label: t("complianceDoc.interests"), variant: "longtext", value: dpia.texts.interests.value },
        { label: t("complianceDoc.legalBasis"), variant: "longtext", value: text(ropa.fields.legalBasis.value) },
        { label: t("complianceDoc.subjects"), variant: "pills", value: list(ropa.fields.subjects.value) },
        { label: t("complianceDoc.volume"), variant: "longtext", value: text(ropa.fields.volume.value) },
        { label: t("complianceDoc.systemName"), variant: "text", value: frame.product },
        { label: t("complianceDoc.systems"), variant: "list", value: list(ropa.fields.systems.value) },
      ],
    },
    {
      title: t("complianceDoc.s.threshold"),
      subtitle: t("complianceDoc.ref.threshold"),
      fields: [
        {
          label: t("complianceDoc.thresholdTable"),
          variant: "table",
          value: {
            columns: [
              { title: t("complianceDoc.no"), width: 5, align: "center" },
              { title: t("complianceDoc.criterionColumn"), width: 55 },
              { title: t("complianceDoc.answer"), width: 12, align: "center" },
              { title: t("complianceDoc.notes"), width: 28 },
            ],
            rows: DPIA_CRITERIA.map((criterion, index) => [
              String(index + 1),
              t.dynamic(`compliance.criterion.${criterion}`),
              { text: answer(dpia.threshold[criterion].answer), bold: dpia.threshold[criterion].answer === "yes" },
              dpia.threshold[criterion].note || EMPTY_VALUE,
            ]),
          },
        },
        { label: t("complianceDoc.thresholdResult"), variant: "text", value: thresholdResult(context, dpia) },
      ],
    },
    {
      title: t("complianceDoc.s.necessity"),
      subtitle: t("complianceDoc.ref.necessity"),
      fields: [
        { label: t("complianceDoc.necessity"), variant: "longtext", value: dpia.texts.necessity.value },
        { label: t("complianceDoc.proportionality"), variant: "longtext", value: dpia.texts.proportionality.value },
        { label: t("complianceDoc.dataGeneral"), variant: "pills", value: list(ropa.fields.dataGeneral.value) },
        { label: t("complianceDoc.dataSpecific"), variant: "pills", value: list(ropa.fields.dataSpecific.value) },
        { label: t("complianceDoc.automatedDecision"), variant: "longtext", value: text(ropa.fields.automatedDecision.value) },
        { label: t("complianceDoc.timing"), variant: "text", value: t.dynamic(`complianceDoc.timingValue.${dpia.signoff.timing ?? "review"}`) },
        {
          label: t("complianceDoc.consultation"),
          variant: "longtext",
          value: joinParts([t.dynamic(`complianceDoc.consultationValue.${dpia.signoff.consultation ?? "no"}`), dpia.texts.consultationReason.value], "\n"),
        },
      ],
    },
    {
      title: t("complianceDoc.s.risks"),
      subtitle: t("complianceDoc.ref.risks"),
      fields: [
        {
          label: t("complianceDoc.riskRegister"),
          variant: "table",
          value: {
            columns: [
              { title: t("complianceDoc.no"), width: 6, align: "center" },
              { title: t("complianceDoc.category"), width: 15 },
              { title: t("complianceDoc.riskEvent"), width: 23 },
              { title: t("complianceDoc.impactShort"), width: 5, align: "center" },
              { title: t("complianceDoc.likelihoodShort"), width: 5, align: "center" },
              { title: t("complianceDoc.inherent"), width: 12 },
              { title: t("complianceDoc.control"), width: 11 },
              { title: t("complianceDoc.residual"), width: 10 },
              { title: t("complianceDoc.treatment"), width: 13 },
            ],
            rows: dpia.risks.map((risk, index) => [
              String(index + 1),
              t.dynamic(`compliance.riskCategory.${risk.category}`),
              risk.eventText || EMPTY_VALUE,
              risk.impact ? String(risk.impact) : EMPTY_VALUE,
              risk.likelihood ? String(risk.likelihood) : EMPTY_VALUE,
              risk.inherent ? { text: risk.inherent.name, tone: risk.inherent.level } : EMPTY_VALUE,
              control(risk.control),
              risk.residual ? { text: `${risk.residual.value} · ${risk.residual.name}`, tone: residualTone(risk.residual.value) } : EMPTY_VALUE,
              risk.treatment ? t.dynamic(`compliance.treatment.${risk.treatment}`) : EMPTY_VALUE,
            ]),
          },
        },
        {
          label: t("complianceDoc.riskSummary"),
          variant: "kv",
          value: [
            { key: t("complianceDoc.risksScored"), value: format.number(dpia.summary.scored) },
            { key: t("complianceDoc.inherentMax"), value: dpia.summary.inherentMax ? RISK_LEVEL_NAMES[dpia.summary.inherentMax] : EMPTY_VALUE },
            { key: t("complianceDoc.residualMax"), value: dpia.summary.residualMax !== null ? String(dpia.summary.residualMax) : EMPTY_VALUE },
            { key: t("complianceDoc.toMitigate"), value: format.number(dpia.summary.toMitigate) },
          ],
        },
        { label: t("complianceDoc.method"), variant: "longtext", value: t("complianceDoc.methodText") },
      ],
    },
    {
      title: t("complianceDoc.s.measures"),
      subtitle: t("complianceDoc.ref.measures"),
      fields: [
        {
          label: t("complianceDoc.mitigationPlan"),
          variant: "table",
          value: {
            columns: [
              { title: t("complianceDoc.no"), width: 5, align: "center" },
              { title: t("complianceDoc.riskEvent"), width: 30 },
              { title: t("complianceDoc.mitigation"), width: 41 },
              { title: t("complianceDoc.owner"), width: 12 },
              { title: t("complianceDoc.dueDate"), width: 12 },
            ],
            rows: dpia.risks.map((risk, index) => [
              String(index + 1),
              risk.eventText || EMPTY_VALUE,
              risk.mitigationText || EMPTY_VALUE,
              risk.owner || EMPTY_VALUE,
              risk.dueDate || EMPTY_VALUE,
            ]),
          },
        },
        { label: t("complianceDoc.generalMeasures"), variant: "list", value: list(dpia.texts.measures.value) },
      ],
    },
    {
      title: t("complianceDoc.s.dpo"),
      subtitle: t("complianceDoc.ref.dpo"),
      fields: [
        { label: t("complianceDoc.dpo"), variant: "text", value: dpia.signoff.dpoName || dpoText(context) },
        { label: t("complianceDoc.dpoAdvice"), variant: "longtext", value: dpia.texts.dpoAdvice.value || t("complianceDoc.dpoAdviceMissing") },
        { label: t("complianceDoc.dpoReviewedAt"), variant: "text", value: textOrEmpty(dpia.signoff.dpoReviewedAt) },
      ],
    },
    {
      title: t("complianceDoc.s.conclusion"),
      subtitle: t("complianceDoc.ref.conclusion"),
      fields: [
        { label: t("complianceDoc.finalRisk"), variant: "risk", value: badge },
        { label: t("complianceDoc.decision"), variant: "text", value: dpia.decision ? t.dynamic(`compliance.decision.${dpia.decision}`) : t("complianceDoc.noDecision") },
        { label: t("complianceDoc.recommendationLabel"), variant: "longtext", value: dpia.texts.recommendation.value || defaultRecommendation(context, overall) },
        { label: t("complianceDoc.nextReview"), variant: "text", value: textOrEmpty(dpia.signoff.nextReviewAt) },
      ],
    },
    {
      title: t("complianceDoc.s.approval"),
      subtitle: t("complianceDoc.ref.approval"),
      fields: [
        {
          label: t("complianceDoc.approvalLayer"),
          variant: "table",
          value: {
            columns: [
              { title: t("complianceDoc.roleColumn"), width: 30 },
              { title: t("complianceDoc.name"), width: 35 },
              { title: t("complianceDoc.date"), width: 20 },
              { title: t("complianceDoc.status"), width: 15 },
            ],
            rows: [
              [t("complianceDoc.preparedBy"), dpia.signoff.preparedBy || EMPTY_VALUE, dpia.signoff.preparedAt || EMPTY_VALUE, t("complianceDoc.done")],
              [t("complianceDoc.checkedByDpo"), dpia.signoff.dpoName || EMPTY_VALUE, dpia.signoff.dpoReviewedAt || EMPTY_VALUE, dpia.signoff.dpoReviewedAt ? t("complianceDoc.done") : t("complianceDoc.waiting")],
              [
                t("complianceDoc.approvedBy"),
                dpia.signoff.approverName || EMPTY_VALUE,
                dpia.signoff.approvedAt || (dpia.approvedAt ? dpia.approvedAt.toISOString().slice(0, 10) : EMPTY_VALUE),
                dpia.status === "approved" ? t("complianceDoc.approved") : t("complianceDoc.waiting"),
              ],
            ],
          },
        },
      ],
    },
  ]);
  return {
    kindLabel: "DPIA",
    title: t("complianceDoc.dpiaTitle"),
    secondaryTitle: context.locale === "en" ? undefined : ENGLISH_TITLES.dpia,
    subject: dpia.activityName,
    code: dpia.code,
    organization: context.profile.legalName || frame.product,
    summary: [
      { label: t("complianceDoc.code"), value: dpia.code },
      { label: t("complianceDoc.ropaCode"), value: dpia.ropaCode },
      { label: t("complianceDoc.dpiaStatus"), value: t.dynamic(`compliance.dpiaStatus.${dpia.status}`) },
      { label: t("complianceDoc.finalRisk"), value: badge.text },
      { label: t("complianceDoc.version"), value: String(dpia.version) },
      { label: t("complianceDoc.updatedAt"), value: format.dateTime(dpia.updatedAt) },
    ],
    sections,
    language: context.locale === "id" ? "id-ID" : context.locale,
    accent: frame.accent,
    footer: footer(builder),
    fileName: safeFileName(`${dpia.code}-${dpia.activityName}`),
  };
}

export function buildIncidentDocument(builder: Builder, incident: IncidentView, activityNames: Map<string, string>): ComplianceDocument {
  const { context, frame } = builder;
  const { t, format } = context;
  const when = (value: Date | null) => (value ? format.dateTime(value) : EMPTY_VALUE);
  const details = incident.details ?? {};
  const severityTone: Record<string, RiskTone> = { low: 1, medium: 3, high: 5 };
  const deadlineStatus =
    incident.hoursLeft === null
      ? t("complianceDoc.noticeDone")
      : incident.overdue
        ? t("complianceDoc.noticeOverdue", { hours: format.number(Math.abs(incident.hoursLeft)) })
        : t("complianceDoc.noticeLeft", { hours: format.number(incident.hoursLeft) });
  const sections = numbered([
    {
      title: t("complianceDoc.s.incidentSummary"),
      fields: [
        { label: t("complianceDoc.code"), variant: "text", value: incident.code },
        { label: t("complianceDoc.incidentTitle"), variant: "text", value: incident.title },
        { label: t("complianceDoc.severity"), variant: "risk", value: { tone: severityTone[incident.severity] ?? 3, text: t.dynamic(`compliance.severity.${incident.severity}`) } },
        { label: t("complianceDoc.status"), variant: "text", value: t.dynamic(`compliance.incidentStatus.${incident.status}`) },
        { label: t("complianceDoc.relatedActivities"), variant: "list", value: (details.activityKeys ?? []).map((key) => activityNames.get(key) ?? key) },
      ],
    },
    {
      title: t("complianceDoc.s.incidentData"),
      subtitle: t("complianceDoc.ref.incidentData"),
      fields: [
        { label: t("complianceDoc.dataExposed"), variant: "longtext", value: textOrEmpty(details.dataCategories) },
        { label: t("complianceDoc.affectedCount"), variant: "text", value: incident.affectedCount !== null ? format.number(incident.affectedCount) : t("complianceDoc.unknown") },
      ],
    },
    {
      title: t("complianceDoc.s.incidentDescription"),
      subtitle: t("complianceDoc.ref.incidentDescription"),
      fields: [
        { label: t("complianceDoc.incidentDescription"), variant: "longtext", value: textOrEmpty(details.description) },
        { label: t("complianceDoc.cause"), variant: "longtext", value: textOrEmpty(details.cause) },
        {
          label: t("complianceDoc.timeline"),
          variant: "kv",
          value: [
            { key: t("complianceDoc.occurredAt"), value: when(incident.occurredAt) },
            { key: t("complianceDoc.discoveredAt"), value: when(incident.discoveredAt) },
            { key: t("complianceDoc.containedAt"), value: when(incident.containedAt) },
            { key: t("complianceDoc.noticeDeadline"), value: when(incident.noticeDeadlineAt) },
            { key: t("complianceDoc.subjectsNotifiedAt"), value: when(incident.subjectsNotifiedAt) },
            { key: t("complianceDoc.authorityNotifiedAt"), value: when(incident.authorityNotifiedAt) },
            { key: t("complianceDoc.publicNotifiedAt"), value: when(incident.publicNotifiedAt) },
            { key: t("complianceDoc.closedAt"), value: when(incident.closedAt) },
          ],
        },
      ],
    },
    {
      title: t("complianceDoc.s.incidentImpact"),
      subtitle: t("complianceDoc.ref.incidentImpact"),
      fields: [{ label: t("complianceDoc.consequences"), variant: "longtext", value: textOrEmpty(details.consequences) }],
    },
    {
      title: t("complianceDoc.s.incidentMeasures"),
      subtitle: t("complianceDoc.ref.incidentMeasures"),
      fields: [{ label: t("complianceDoc.measures"), variant: "longtext", value: textOrEmpty(details.measures) }],
    },
    {
      title: t("complianceDoc.s.incidentNotice"),
      subtitle: t("complianceDoc.ref.incidentNotice"),
      fields: [
        { label: t("complianceDoc.noticeStatus"), variant: "text", value: deadlineStatus },
        { label: t("complianceDoc.notificationNote"), variant: "longtext", value: textOrEmpty(details.notificationNote) },
      ],
    },
    {
      title: t("complianceDoc.s.incidentContacts"),
      fields: [
        { label: t("complianceDoc.controller"), variant: "kv", value: controllerRows(context) },
        { label: t("complianceDoc.dpo"), variant: "text", value: dpoText(context) },
        { label: t("complianceDoc.reporter"), variant: "text", value: textOrEmpty(details.reporterName) },
      ],
    },
  ]);
  return {
    kindLabel: t("complianceDoc.incidentBadge"),
    title: t("complianceDoc.incidentTitleDoc"),
    secondaryTitle: context.locale === "en" ? undefined : ENGLISH_TITLES.incident,
    subject: incident.title,
    code: incident.code,
    organization: context.profile.legalName || frame.product,
    summary: [
      { label: t("complianceDoc.code"), value: incident.code },
      { label: t("complianceDoc.severity"), value: t.dynamic(`compliance.severity.${incident.severity}`) },
      { label: t("complianceDoc.discoveredAt"), value: when(incident.discoveredAt) },
      { label: t("complianceDoc.noticeDeadline"), value: when(incident.noticeDeadlineAt) },
      { label: t("complianceDoc.status"), value: t.dynamic(`compliance.incidentStatus.${incident.status}`) },
      { label: t("complianceDoc.noticeStatus"), value: deadlineStatus },
    ],
    sections,
    language: context.locale === "id" ? "id-ID" : context.locale,
    accent: frame.accent,
    footer: footer(builder),
    fileName: safeFileName(`${incident.code}-${incident.title}`),
  };
}

/** The whole register in one document: a summary table, then the key fields of every activity. */
export function buildRegisterDocument(builder: Builder, views: RopaView[]): ComplianceDocument {
  const { context, frame } = builder;
  const { t } = context;
  const active = views.filter((view) => view.status !== "retired");
  const summary: DocumentSection = {
    number: "I",
    title: t("complianceDoc.s.registerSummary"),
    subtitle: t("complianceDoc.ref.register"),
    fields: [
      {
        label: t("complianceDoc.activities"),
        variant: "table",
        value: {
          columns: [
            { title: t("complianceDoc.no"), width: 5, align: "center" },
            { title: t("complianceDoc.code"), width: 15 },
            { title: t("complianceDoc.activityName"), width: 32 },
            { title: t("complianceDoc.role"), width: 14 },
            { title: t("complianceDoc.dpiaStatus"), width: 18 },
            { title: t("complianceDoc.recordStatus"), width: 16 },
          ],
          rows: active.map((view, index) => [
            String(index + 1),
            view.code,
            text(view.fields.name.value),
            view.kind === "processor" ? t("complianceDoc.roleProcessor") : t("complianceDoc.roleController"),
            view.dpia ? t.dynamic(`compliance.dpiaStatus.${view.dpia.status}`) : view.dpiaRequired ? { text: t("complianceDoc.dpiaNotStarted"), tone: 4 } : t("complianceDoc.dpiaNotRequired"),
            t.dynamic(`compliance.status.${view.status}`),
          ]),
        },
      },
      { label: t("complianceDoc.controller"), variant: "kv", value: controllerRows(context) },
      { label: t("complianceDoc.dpo"), variant: "text", value: dpoText(context) },
    ],
  };
  const perActivity: DocumentSection[] = active.map((view, index) => {
    const f = view.fields;
    return {
      number: ROMAN[index + 1] ?? String(index + 2),
      title: `${view.code} — ${text(f.name.value)}`,
      fields: [
        { label: t("complianceDoc.purpose"), variant: "longtext", value: text(f.purpose.value) },
        { label: t("complianceDoc.legalBasis"), variant: "longtext", value: text(f.legalBasis.value) },
        { label: t("complianceDoc.subjects"), variant: "pills", value: list(f.subjects.value) },
        { label: t("complianceDoc.dataGeneral"), variant: "pills", value: list(f.dataGeneral.value) },
        { label: t("complianceDoc.dataSpecific"), variant: "pills", value: list(f.dataSpecific.value) },
        { label: t("complianceDoc.recipientsExternal"), variant: "list", value: list(f.recipientsExternal.value) },
        { label: t("complianceDoc.retention"), variant: "longtext", value: text(f.retention.value) },
        { label: t("complianceDoc.security"), variant: "list", value: list(f.security.value) },
        { label: t("complianceDoc.transfer"), variant: "longtext", value: text(f.transfer.value) },
      ],
    };
  });
  return {
    kindLabel: "RoPA",
    title: t("complianceDoc.registerTitle"),
    secondaryTitle: context.locale === "en" ? undefined : ENGLISH_TITLES.register,
    subject: context.profile.legalName || frame.product,
    code: context.scope === "platform" ? "RoPA-PLATFORM" : "RoPA-REGISTER",
    organization: context.profile.legalName || frame.product,
    summary: [
      { label: t("complianceDoc.activities"), value: context.format.number(active.length) },
      { label: t("complianceDoc.dpo"), value: dpoText(context) },
    ],
    sections: [summary, ...perActivity],
    language: context.locale === "id" ? "id-ID" : context.locale,
    accent: frame.accent,
    footer: footer(builder),
    fileName: safeFileName(`RoPA-${context.profile.legalName || frame.product}`),
  };
}

/** Names of catalog and custom activities, for incident links. */
export function activityNameMap(views: RopaView[]): Map<string, string> {
  return new Map(views.map((view) => [view.key, `${view.code} — ${text(view.fields.name.value)}`]));
}
