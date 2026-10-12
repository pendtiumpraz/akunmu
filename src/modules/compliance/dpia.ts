import { z } from "zod";
import { randomString } from "../../shared/crypto/tokens";
import { AppError, notFound } from "../../shared/http/errors";
import { cleanLocalized, pickLocalized, type LocalizedText } from "../../shared/i18n/localized";
import { recordAudit } from "../audit/service";
import { DPIA_CRITERIA, activityByKey, isCustomKey, isProcessorKey, type DpiaCriterion } from "./catalog";
import { fillPlaceholders } from "./content";
import { findDpiaRecord, insertDpiaRecord, listDpiaRecords, updateDpiaRecord } from "./repository";
import { getRopa, type RopaContext, type RopaView } from "./ropa";
import {
  RISK_CATEGORIES,
  TREATMENTS,
  inherentRisk,
  residualRisk,
  summarizeRisks,
  type InherentRisk,
  type ResidualRisk,
  type RiskSummary,
} from "./risk";
import type { DpiaAssessmentRecord } from "./schema";
import {
  DPIA_DECISIONS,
  DPIA_STATUSES,
  DPIA_TEXT_FIELDS,
  type DpiaRisk,
  type DpiaSignoff,
  type DpiaTextField,
  type DpiaThreshold,
} from "./types";

/**
 * Data protection impact assessments (UU PDP Art. 34; PP 33/2026 Art. 120–122), one per processing
 * activity. A new DPIA starts from the activity's RoPA record: the threshold answers from the criteria it
 * meets, the risk register from the catalog's default risks, and the texts from the catalog content.
 */

export type DpiaRiskView = DpiaRisk & {
  eventText: string;
  mitigationText: string;
  inherent: InherentRisk | null;
  residual: ResidualRisk | null;
};

export type DpiaView = {
  id: number;
  key: string;
  code: string;
  activityName: string;
  ropaCode: string;
  status: DpiaAssessmentRecord["status"];
  decision: DpiaAssessmentRecord["decision"];
  threshold: Record<DpiaCriterion, { answer: "yes" | "no" | null; note: string; suggested: boolean }>;
  required: boolean | null;
  texts: Record<DpiaTextField, { value: string; defaultValue: string; override: LocalizedText }>;
  risks: DpiaRiskView[];
  summary: RiskSummary;
  signoff: DpiaSignoff;
  version: number;
  approvedAt: Date | null;
  updatedAt: Date;
  deletedAt: Date | null;
};

function dpiaCode(ropa: RopaView): string {
  return ropa.code.replace(/^RoPA-/, "DPIA-");
}

function defaultTexts(ropa: RopaView, context: RopaContext): Record<DpiaTextField, string> {
  const activity = activityByKey(ropa.key);
  const text = activity ? context.content.activities[activity.key] : undefined;
  const values = { controller: context.profile.legalName, processor: context.operator.legalName };
  const fill = (value: string | undefined) => (value ? fillPlaceholders(value, values) : "");
  const description = [ropa.fields.description.value, ropa.fields.purpose.value].filter((value) => typeof value === "string" && value).join("\n\n");
  return {
    description: description as string,
    interests: fill(text?.interests),
    necessity: fill(text?.necessity),
    proportionality: fill(text?.proportionality),
    measures: (ropa.fields.security.value as string[]).join("\n"),
    dpoAdvice: "",
    consultationReason: "",
    recommendation: "",
  };
}

function riskTexts(risk: DpiaRisk, ropa: RopaView, context: RopaContext): { event: string; mitigation: string } {
  const template = risk.templateId ? context.content.activities[ropa.key]?.risks?.[risk.templateId] : undefined;
  return {
    event: pickLocalized(cleanLocalized(risk.event), context.locale) || template?.event || "",
    mitigation: pickLocalized(cleanLocalized(risk.mitigation), context.locale) || template?.mitigation || "",
  };
}

function toView(row: DpiaAssessmentRecord, ropa: RopaView, context: RopaContext): DpiaView {
  const defaults = defaultTexts(ropa, context);
  const texts = Object.fromEntries(
    DPIA_TEXT_FIELDS.map((field) => {
      const override = cleanLocalized(row.content?.[field] ?? {});
      const picked = Object.keys(override).length > 0 ? pickLocalized(override, context.locale) : "";
      return [field, { value: picked || defaults[field], defaultValue: defaults[field], override }];
    }),
  ) as DpiaView["texts"];
  const suggested = new Set(ropa.criteria.filter((entry) => entry.met).map((entry) => entry.criterion));
  const threshold = Object.fromEntries(
    DPIA_CRITERIA.map((criterion) => {
      const answer = row.threshold?.[criterion];
      return [criterion, { answer: answer?.answer ?? null, note: answer?.note ?? "", suggested: suggested.has(criterion) }];
    }),
  ) as DpiaView["threshold"];
  const answers = Object.values(threshold);
  const required = answers.some((entry) => entry.answer === "yes") ? true : answers.every((entry) => entry.answer === "no") ? false : null;
  const risks = row.risks.map((risk) => {
    const inherent = inherentRisk(risk.impact, risk.likelihood);
    const { event, mitigation } = riskTexts(risk, ropa, context);
    return { ...risk, eventText: event, mitigationText: mitigation, inherent, residual: residualRisk(inherent?.level, risk.control) };
  });
  return {
    id: row.id,
    key: row.activityKey,
    code: dpiaCode(ropa),
    activityName: ropa.fields.name.value as string,
    ropaCode: ropa.code,
    status: row.status,
    decision: row.decision,
    threshold,
    required,
    texts,
    risks,
    summary: summarizeRisks(row.risks),
    signoff: row.signoff ?? {},
    version: row.version,
    approvedAt: row.approvedAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function assertDpiaKey(key: string) {
  if (isProcessorKey(key)) throw new AppError(422, "errors.dpiaProcessor");
}

export async function listDpia(context: RopaContext, trashed = false): Promise<DpiaView[]> {
  const rows = await listDpiaRecords(context.tenantId, trashed);
  const views: DpiaView[] = [];
  for (const row of rows) {
    try {
      views.push(toView(row, await getRopa(context, row.activityKey), context));
    } catch {
      // The activity no longer exists (e.g. a deleted custom activity): its DPIA stays hidden until restored.
    }
  }
  return views;
}

export async function getDpia(context: RopaContext, key: string): Promise<DpiaView> {
  assertDpiaKey(key);
  const row = await findDpiaRecord(context.tenantId, key);
  if (!row || row.deletedAt) throw notFound();
  return toView(row, await getRopa(context, key), context);
}

function seedRisks(key: string): DpiaRisk[] {
  const activity = activityByKey(key);
  return (activity?.risks ?? []).map((template) => ({
    id: randomString(8).toLowerCase(),
    templateId: template.id,
    category: template.category,
    event: {},
    mitigation: {},
    impact: template.impact,
    likelihood: template.likelihood,
    control: template.control,
    treatment: template.treatment,
  }));
}

function seedThreshold(ropa: RopaView): DpiaThreshold {
  const threshold: DpiaThreshold = {};
  for (const entry of ropa.criteria) if (entry.met) threshold[entry.criterion] = { answer: "yes" };
  return threshold;
}

/** Starts the DPIA of an activity (or brings back a trashed one with fresh defaults). */
export async function createDpia(context: RopaContext, key: string, actorId: number, preparedBy: string): Promise<DpiaView> {
  assertDpiaKey(key);
  const ropa = await getRopa(context, key);
  const existing = await findDpiaRecord(context.tenantId, key);
  if (existing && !existing.deletedAt) throw new AppError(409, "errors.dpiaExists");
  const seed = {
    status: "draft" as const,
    threshold: seedThreshold(ropa),
    content: {},
    risks: seedRisks(key),
    decision: null,
    signoff: { preparedBy, preparedAt: new Date().toISOString().slice(0, 10), timing: "review" as const, consultation: "no" as const },
    approvedAt: null,
    approvedBy: null,
    updatedBy: actorId,
  };
  const row = existing
    ? await updateDpiaRecord(existing.id, { ...seed, deletedAt: null, version: existing.version + 1 })
    : await insertDpiaRecord({ ...seed, tenantId: context.tenantId, activityKey: key });
  if (!row) throw notFound();
  await recordAudit({ actorType: "staff", actorId, action: "dpia.created", subjectType: "dpia", subjectId: row.id, meta: { key, scope: context.scope } });
  return toView(row, ropa, context);
}

const localizedInput = z.record(z.string(), z.string().max(8000, { error: "validation.tooLong" }));
const isoDate = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "validation.invalid" })]);

const riskInput = z.object({
  id: z.string().trim().min(1).max(40).optional(),
  templateId: z.string().trim().max(60).optional(),
  category: z.enum(RISK_CATEGORIES),
  event: localizedInput.default({}),
  mitigation: localizedInput.default({}),
  impact: z.number().int().min(1).max(5).nullable(),
  likelihood: z.number().int().min(1).max(5).nullable(),
  control: z.number().int().min(1).max(3).nullable(),
  treatment: z.enum(TREATMENTS).nullable(),
  owner: z.string().trim().max(120).optional(),
  dueDate: isoDate.nullable().optional(),
});

export const dpiaUpdateSchema = z.object({
  threshold: z
    .partialRecord(z.enum(DPIA_CRITERIA), z.object({ answer: z.enum(["yes", "no"]).nullable(), note: z.string().trim().max(1000).optional() }))
    .optional(),
  texts: z.partialRecord(z.enum(DPIA_TEXT_FIELDS), localizedInput.nullable()).optional(),
  risks: z.array(riskInput).max(60).optional(),
  decision: z.enum(DPIA_DECISIONS).nullable().optional(),
  status: z.enum(DPIA_STATUSES).optional(),
  signoff: z
    .object({
      preparedBy: z.string().trim().max(120).optional(),
      preparedAt: isoDate.optional(),
      dpoName: z.string().trim().max(120).optional(),
      dpoReviewedAt: isoDate.optional(),
      approverName: z.string().trim().max(120).optional(),
      approvedAt: isoDate.optional(),
      timing: z.enum(["before", "review"]).optional(),
      consultation: z.enum(["yes", "no"]).optional(),
      nextReviewAt: isoDate.optional(),
    })
    .optional(),
});

export type DpiaUpdateInput = z.infer<typeof dpiaUpdateSchema>;

export async function updateDpia(context: RopaContext, key: string, input: DpiaUpdateInput, actorId: number): Promise<DpiaView> {
  assertDpiaKey(key);
  const row = await findDpiaRecord(context.tenantId, key);
  if (!row || row.deletedAt) throw notFound();
  const content = { ...(row.content ?? {}) };
  for (const [field, value] of Object.entries(input.texts ?? {})) {
    const cleaned = value ? cleanLocalized(value) : {};
    if (Object.keys(cleaned).length === 0) delete content[field];
    else content[field] = cleaned;
  }
  const threshold: DpiaThreshold = { ...(row.threshold ?? {}) };
  for (const [criterion, value] of Object.entries(input.threshold ?? {}) as [DpiaCriterion, { answer: "yes" | "no" | null; note?: string }][]) {
    threshold[criterion] = { answer: value.answer, note: value.note ?? threshold[criterion]?.note };
  }
  const risks: DpiaRisk[] | undefined = input.risks?.map((risk) => ({
    id: risk.id ?? randomString(8).toLowerCase(),
    templateId: risk.templateId,
    category: risk.category,
    event: cleanLocalized(risk.event),
    mitigation: cleanLocalized(risk.mitigation),
    impact: risk.impact,
    likelihood: risk.likelihood,
    control: risk.control,
    treatment: risk.treatment,
    owner: risk.owner,
    dueDate: risk.dueDate || null,
  }));
  const signoff: DpiaSignoff = { ...(row.signoff ?? {}), ...(input.signoff ?? {}) };
  const approving = input.status === "approved" && row.status !== "approved";
  const updated = await updateDpiaRecord(row.id, {
    content,
    threshold,
    ...(risks ? { risks } : {}),
    ...(input.decision !== undefined ? { decision: input.decision } : {}),
    ...(input.status ? { status: input.status } : {}),
    signoff,
    version: row.version + 1,
    updatedBy: actorId,
    ...(approving ? { approvedAt: new Date(), approvedBy: actorId } : {}),
    ...(input.status && input.status !== "approved" ? { approvedAt: null, approvedBy: null } : {}),
  });
  if (!updated) throw notFound();
  await recordAudit({
    actorType: "staff",
    actorId,
    action: approving ? "dpia.approved" : "dpia.updated",
    subjectType: "dpia",
    subjectId: row.id,
    meta: { key, scope: context.scope },
  });
  return toView(updated, await getRopa(context, key), context);
}

export async function deleteDpia(context: RopaContext, key: string, actorId: number): Promise<void> {
  const row = await findDpiaRecord(context.tenantId, key);
  if (!row || row.deletedAt) throw notFound();
  await updateDpiaRecord(row.id, { deletedAt: new Date() });
  await recordAudit({ actorType: "staff", actorId, action: "dpia.deleted", subjectType: "dpia", subjectId: row.id, meta: { key, scope: context.scope } });
}

export async function restoreDpia(context: RopaContext, key: string, actorId: number): Promise<DpiaView> {
  const row = await findDpiaRecord(context.tenantId, key);
  if (!row || !row.deletedAt) throw notFound();
  const restored = await updateDpiaRecord(row.id, { deletedAt: null });
  if (!restored) throw notFound();
  await recordAudit({ actorType: "staff", actorId, action: "dpia.restored", subjectType: "dpia", subjectId: row.id, meta: { key, scope: context.scope } });
  return toView(restored, await getRopa(context, key), context);
}

/** Whether a key can carry a DPIA (custom activities and catalog activities of the scope). */
export function dpiaAllowed(key: string): boolean {
  return isCustomKey(key) || Boolean(activityByKey(key));
}
