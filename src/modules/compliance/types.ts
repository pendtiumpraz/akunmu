import type { LocalizedText } from "../../shared/i18n/localized";
import type { DpiaCriterion } from "./catalog";
import type { RiskCategory, Treatment } from "./risk";

/** Text fields of a RoPA record that staff can correct (per language). */
export const ROPA_TEXT_FIELDS = [
  "name",
  "description",
  "purpose",
  "processing",
  "legalBasis",
  "source",
  "retention",
  "deletion",
  "automatedDecision",
  "profiling",
  "systems",
  "transfer",
  "volume",
  "notes",
] as const;

/** List fields of a RoPA record; stored as one item per line. */
export const ROPA_LIST_FIELDS = [
  "subjects",
  "dataGeneral",
  "dataSpecific",
  "recipientsInternal",
  "recipientsExternal",
  "security",
  "rights",
  "flow",
] as const;

export type RopaTextField = (typeof ROPA_TEXT_FIELDS)[number];
export type RopaListField = (typeof ROPA_LIST_FIELDS)[number];
export type RopaField = RopaTextField | RopaListField;

export const ROPA_FIELDS: readonly RopaField[] = [...ROPA_TEXT_FIELDS, ...ROPA_LIST_FIELDS];

export function isListField(field: string): field is RopaListField {
  return (ROPA_LIST_FIELDS as readonly string[]).includes(field);
}

export const RECORD_STATUSES = ["draft", "active", "retired"] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

/** Person in charge and unit of a processing activity (plain text, not translated). */
export type RopaAssignment = {
  picName?: string;
  picRole?: string;
  picEmail?: string;
  unit?: string;
};

export const DPIA_STATUSES = ["draft", "review", "approved"] as const;
export type DpiaStatus = (typeof DPIA_STATUSES)[number];

export const DPIA_DECISIONS = ["proceed", "conditions", "stop"] as const;
export type DpiaDecision = (typeof DPIA_DECISIONS)[number];

export type ThresholdAnswer = { answer: "yes" | "no" | null; note?: string };
export type DpiaThreshold = Partial<Record<DpiaCriterion, ThresholdAnswer>>;

/** DPIA text fields (per language); empty fields fall back to the catalog content. */
export const DPIA_TEXT_FIELDS = [
  "description",
  "interests",
  "necessity",
  "proportionality",
  "measures",
  "dpoAdvice",
  "consultationReason",
  "recommendation",
] as const;
export type DpiaTextField = (typeof DPIA_TEXT_FIELDS)[number];

export type DpiaRisk = {
  id: string;
  /** Catalog risk this row started from; its texts fill empty event/mitigation fields. */
  templateId?: string;
  category: RiskCategory;
  event: LocalizedText;
  mitigation: LocalizedText;
  impact: number | null;
  likelihood: number | null;
  control: number | null;
  treatment: Treatment | null;
  owner?: string;
  dueDate?: string | null;
};

/** Sign-off of the DPIA (plain names and ISO dates). */
export type DpiaSignoff = {
  preparedBy?: string;
  preparedAt?: string;
  dpoName?: string;
  dpoReviewedAt?: string;
  approverName?: string;
  approvedAt?: string;
  /** "before" = assessed before processing started (PP 33/2026 Art. 121(1)); "review" = assessment of running processing. */
  timing?: "before" | "review";
  /** Consultation with the authority (PP 33/2026 Art. 122). */
  consultation?: "yes" | "no";
  nextReviewAt?: string;
};

export const INCIDENT_STATUSES = ["open", "contained", "notified", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_SEVERITIES = ["low", "medium", "high"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

/** Breach documentation per PP 33/2026 Art. 114(3) and 116(1). */
export type IncidentDetails = {
  description?: string;
  cause?: string;
  dataCategories?: string;
  consequences?: string;
  measures?: string;
  notificationNote?: string;
  reporterName?: string;
  activityKeys?: string[];
};

/** Deadline for notifying subjects and the authority (UU PDP Art. 46; PP 33/2026 Art. 114). */
export const BREACH_NOTICE_HOURS = 72;

/** Deadline for answering data subject requests (UU PDP Art. 30, 32, 40, 41; PP 33/2026 Art. 77). */
export const REQUEST_DEADLINE_HOURS = 72;
