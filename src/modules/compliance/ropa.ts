import { z } from "zod";
import { randomString } from "../../shared/crypto/tokens";
import { currentTenantId } from "../../shared/db";
import { AppError, notFound } from "../../shared/http/errors";
import { i18nFor } from "../../shared/i18n/messages-loader";
import { cleanLocalized, pickLocalized, type LocalizedText } from "../../shared/i18n/localized";
import { LOCALE_CODES, type Locale } from "../../shared/i18n/locales";
import { recordAudit } from "../audit/service";
import { loadPlatformAi, loadTenantAi } from "../ai/config";
import { AI_PRESETS } from "../ai/types";
import {
  ACTIVITIES,
  CUSTOM_PREFIX,
  DPIA_CRITERIA,
  LARGE_SCALE_MONTHLY,
  PROCESSOR_PREFIX,
  activitiesForScope,
  activityByKey,
  isCustomKey,
  isProcessorKey,
  processorKey,
  type ActivityDefinition,
  type DpiaCriterion,
  type Infrastructure,
} from "./catalog";
import { complianceContent, fillPlaceholders, type ActivityContent, type ComplianceContent } from "./content";
import { describeInfrastructure, infrastructureLines, transferSummary, type AiProviderSummary, type InfrastructureLocation } from "./hosting";
import { loadPrivacyProfile, loadRetentionPolicy, type PrivacyProfile, type RetentionPolicy } from "./profile";
import { countCustomActivities, findActivityRecord, findDpiaRecord, listActivityRecords, listDpiaRecords, setActivityDeletedAt, upsertActivityRecord } from "./repository";
import { summarizeRisks, type OverallRisk } from "./risk";
import type { ProcessingActivityRecord } from "./schema";
import { countStats, type StatValue } from "./stats";
import {
  RECORD_STATUSES,
  ROPA_FIELDS,
  isListField,
  type DpiaStatus,
  type RecordStatus,
  type RopaAssignment,
  type RopaField,
} from "./types";

/**
 * Records of processing activities (UU PDP Art. 31; PP 33/2026 Art. 74). Each record is built from the
 * catalog defaults, the live counters, the detected data locations and the staff's stored corrections.
 *
 * Owners: a workspace (tenant, the controller) or the platform (tenant scope null): AkunMu's operator
 * as controller of its own activities, plus one processor record per workspace activity (Art. 74(5)).
 */

export type ComplianceScope = "tenant" | "platform";
export type RopaKind = "catalog" | "processor" | "custom";

export type RopaFieldView = { value: string | string[]; defaultValue: string | string[]; override: LocalizedText };

export type CriterionView = { criterion: DpiaCriterion; met: boolean; source: "catalog" | "stats" | "staff" | null };

export type RopaView = {
  key: string;
  kind: RopaKind;
  code: string;
  status: RecordStatus;
  inUse: boolean;
  stats: StatValue[];
  criteria: CriterionView[];
  dpiaRequired: boolean;
  dpia: { status: DpiaStatus; overall: OverallRisk | null; updatedAt: Date } | null;
  fields: Record<RopaField, RopaFieldView>;
  assignment: Required<RopaAssignment>;
  version: number;
  reviewedAt: Date | null;
  updatedAt: Date | null;
  /** Fields that are empty or still need a staff decision (e.g. the retention period). */
  missing: RopaField[];
  infrastructure: InfrastructureLocation[];
};

/** Everything a record needs besides its own row; loaded once per request. */
export type RopaContext = {
  scope: ComplianceScope;
  tenantId: number | null;
  locale: Locale;
  content: ComplianceContent;
  profile: PrivacyProfile;
  retention: RetentionPolicy;
  /** Operator profile, for the processor and the subprocessor list. */
  operator: PrivacyProfile;
  aiProviders: AiProviderSummary[];
  locationOverrides: Partial<Record<Infrastructure, string>>;
  t: Awaited<ReturnType<typeof i18nFor>>["t"];
  format: Awaited<ReturnType<typeof i18nFor>>["format"];
};

function ownerTenant(scope: ComplianceScope): number | null {
  if (scope === "platform") return null;
  const tenantId = currentTenantId();
  if (tenantId === null) throw new Error("A tenant RoPA needs a tenant scope.");
  return tenantId;
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function presetFor(baseUrl: string, preset: string): string {
  if (preset && preset !== "custom") return preset;
  const host = hostOf(baseUrl);
  return AI_PRESETS.find((entry) => entry.baseUrl && hostOf(entry.baseUrl) === host)?.id ?? preset;
}

async function aiProviderSummaries(scope: ComplianceScope): Promise<AiProviderSummary[]> {
  const configs = [await loadPlatformAi()];
  if (scope === "tenant") {
    const tenantAi = await loadTenantAi();
    if (tenantAi.mode === "own") configs.splice(0, 1, tenantAi);
  }
  return configs.flatMap((config) =>
    config.providers.filter((provider) => provider.enabled).map((provider) => ({ label: provider.label, preset: presetFor(provider.baseUrl, provider.preset), baseUrl: provider.baseUrl })),
  );
}

/** Loads the shared context. The operator profile and platform AI are read in the platform scope by the caller when needed. */
export async function loadRopaContext(scope: ComplianceScope, locale: Locale, operator?: PrivacyProfile): Promise<RopaContext> {
  const tenantId = ownerTenant(scope);
  const [{ t, format }, content, profile, retention, aiProviders] = await Promise.all([
    i18nFor(locale),
    complianceContent(locale),
    loadPrivacyProfile(),
    loadRetentionPolicy(),
    aiProviderSummaries(scope),
  ]);
  const operatorProfile = operator ?? profile;
  return {
    scope,
    tenantId,
    locale,
    content,
    profile,
    retention,
    operator: operatorProfile,
    aiProviders,
    locationOverrides: operatorProfile.locations ?? {},
    t,
    format,
  };
}

function retentionText(context: RopaContext, kind: "findings" | "signIns" | "audit" | "ai"): { text: string; unset: boolean } {
  const { retention: policy, content } = context;
  const days = { findings: policy.findingDays, signIns: policy.signedOutDays, audit: policy.auditDays, ai: policy.aiDays }[kind];
  const texts = content.common.retention;
  const off = { findings: texts.findingsOff, signIns: texts.signInsOff, audit: texts.auditOff, ai: texts.aiOff }[kind];
  const on = { findings: texts.findingsDays, signIns: texts.signInsDays, audit: texts.auditDays, ai: texts.aiDays }[kind];
  return days ? { text: fillPlaceholders(on, { days: context.format.number(days) }), unset: false } : { text: off, unset: true };
}

function placeholderValues(context: RopaContext): { values: Record<string, string>; unset: Set<string> } {
  const unset = new Set<string>();
  // Assistant conversations are kept until their owner deletes them, so an unset AI period is a valid choice.
  const entries = { retentionFindings: "findings", retentionSignIns: "signIns", retentionAudit: "audit" } as const;
  const values: Record<string, string> = {
    controller: context.profile.legalName || context.t("compliance.controllerUnnamed"),
    processor: context.operator.legalName || context.t("compliance.processorUnnamed"),
    retentionWorkspace: context.content.common.retention.workspace,
    retentionAi: retentionText(context, "ai").text,
  };
  for (const [name, kind] of Object.entries(entries)) {
    const { text, unset: isUnset } = retentionText(context, kind);
    values[name] = text;
    if (isUnset) unset.add(name);
  }
  return { values, unset };
}

const splitLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** Resolves one field: the staff's correction in this language (or any language), else the default. */
function resolveField(field: RopaField, defaultValue: string | string[], override: LocalizedText | undefined, locale: Locale): RopaFieldView {
  const stored = cleanLocalized(override ?? {});
  const picked = Object.keys(stored).length > 0 ? pickLocalized(stored, locale) : "";
  if (!picked) return { value: defaultValue, defaultValue, override: stored };
  return { value: isListField(field) ? splitLines(picked) : picked, defaultValue, override: stored };
}

function volumeText(context: RopaContext, stats: StatValue[], processor: boolean): string {
  if (stats.length === 0) return "";
  return stats
    .map((stat) =>
      context.t(processor ? "compliance.volumeProcessor" : "compliance.volumeLine", {
        label: context.t.dynamic(`compliance.stat.${stat.key}`),
        total: context.format.number(stat.total),
        recent: context.format.number(stat.recent),
        tenants: context.format.number(stat.tenants),
      }),
    )
    .join("\n");
}

function catalogDefaults(
  activity: ActivityDefinition,
  text: ActivityContent,
  context: RopaContext,
  stats: StatValue[],
  infrastructure: InfrastructureLocation[],
  kind: RopaKind,
): { defaults: Record<RopaField, string | string[]>; unset: boolean } {
  const { values, unset } = placeholderValues(context);
  const fill = (value: string) => fillPlaceholders(value, values);
  const usesUnsetRetention = [...unset].some((name) => text.retention.includes(`{${name}}`));
  const transfer = transferSummary(infrastructure, context.content.common);
  const processor = kind === "processor";
  const common = context.content.common;
  const subprocessors = infrastructure.map((entry) => `${entry.name} — ${entry.role}`);
  const defaults: Record<RopaField, string | string[]> = {
    name: processor ? context.t("compliance.processorRecordName", { name: text.name }) : text.name,
    description: processor
      ? fillPlaceholders(common.processor.scope, {
          count: context.format.number(stats[0]?.tenants ?? 0),
          processor: values.processor,
          activity: text.name,
          purpose: text.purpose,
        })
      : fill(text.description),
    purpose: fill(text.purpose),
    processing: fill(text.processing),
    legalBasis: processor ? common.processor.instructions : fill(text.legalBasis),
    source: fill(text.source),
    retention: processor ? context.t("compliance.processorRetention") : fill(text.retention),
    deletion: fill(text.deletion),
    automatedDecision: fill(text.automatedDecision),
    profiling: fill(text.profiling),
    systems: infrastructureLines(infrastructure).join("\n"),
    transfer: transfer.details,
    volume: volumeText(context, stats, processor),
    notes: "",
    subjects: text.subjects.map(fill),
    dataGeneral: text.dataGeneral.map(fill),
    dataSpecific: text.dataSpecific.map(fill),
    recipientsInternal: text.recipientsInternal.map(fill),
    recipientsExternal: processor ? [common.processor.subprocessors, ...subprocessors] : text.recipientsExternal.map(fill),
    security: processor ? [...text.security.map(fill), common.processor.security] : text.security.map(fill),
    rights: processor ? [context.t("compliance.processorRights")] : text.rights.map(fill),
    flow: text.flow.map(fill),
  };
  return { defaults, unset: usesUnsetRetention && !processor };
}

function emptyDefaults(): Record<RopaField, string | string[]> {
  return Object.fromEntries(ROPA_FIELDS.map((field) => [field, isListField(field) ? [] : ""])) as Record<RopaField, string | string[]>;
}

const REQUIRED_FIELDS: RopaField[] = ["name", "purpose", "legalBasis", "subjects", "dataGeneral", "retention", "security", "rights"];

function criteriaFor(activity: ActivityDefinition | undefined, stats: StatValue[], record: ProcessingActivityRecord | undefined, processor: boolean): CriterionView[] {
  return DPIA_CRITERIA.map((criterion) => {
    const stored = record?.criteria?.[criterion];
    if (typeof stored === "boolean") return { criterion, met: stored, source: "staff" as const };
    if (!processor && activity?.criteria.includes(criterion)) return { criterion, met: true, source: "catalog" as const };
    if (!processor && criterion === "large_scale" && (stats[0]?.recent ?? 0) > LARGE_SCALE_MONTHLY) return { criterion, met: true, source: "stats" as const };
    return { criterion, met: false, source: null };
  });
}

type DpiaSummary = RopaView["dpia"];

function buildView(
  key: string,
  kind: RopaKind,
  activity: ActivityDefinition | undefined,
  record: ProcessingActivityRecord | undefined,
  stats: StatValue[],
  dpia: DpiaSummary,
  context: RopaContext,
): RopaView {
  const infrastructure = activity
    ? describeInfrastructure(activity.infrastructure, context.content.common, { aiProviders: context.aiProviders, overrides: context.locationOverrides })
    : [];
  const text = activity ? context.content.activities[activity.key] : undefined;
  const { defaults, unset } = activity && text ? catalogDefaults(activity, text, context, stats, infrastructure, kind) : { defaults: emptyDefaults(), unset: false };
  const overrides = record?.overrides ?? {};
  const fields = Object.fromEntries(
    ROPA_FIELDS.map((field) => [field, resolveField(field, defaults[field], overrides[field], context.locale)]),
  ) as Record<RopaField, RopaFieldView>;
  const missing = REQUIRED_FIELDS.filter((field) => {
    const value = fields[field].value;
    return Array.isArray(value) ? value.length === 0 : value.trim() === "";
  });
  if (unset && Object.keys(fields.retention.override).length === 0 && !missing.includes("retention")) missing.push("retention");
  const criteria = criteriaFor(activity, stats, record, kind === "processor");
  const profile = context.profile;
  const assignment = record?.assignment ?? {};
  const catalogCode = activity ? (kind === "processor" ? `RoPA-PRS-${activity.code}` : `RoPA-${activity.code}`) : null;
  return {
    key,
    kind,
    code: record?.code ?? catalogCode ?? key,
    status: record?.status ?? "active",
    inUse: kind === "custom" ? true : (stats[0]?.total ?? 0) > 0,
    stats,
    criteria,
    dpiaRequired: kind !== "processor" && criteria.some((entry) => entry.met),
    dpia,
    fields,
    assignment: {
      picName: assignment.picName ?? profile.picName,
      picRole: assignment.picRole ?? profile.picRole,
      picEmail: assignment.picEmail ?? profile.picEmail,
      unit: assignment.unit ?? profile.unit,
    },
    version: record?.version ?? 1,
    reviewedAt: record?.reviewedAt ?? null,
    updatedAt: record?.updatedAt ?? null,
    missing,
    infrastructure,
  };
}

async function dpiaSummaries(tenantId: number | null): Promise<Map<string, NonNullable<DpiaSummary>>> {
  const rows = await listDpiaRecords(tenantId);
  return new Map(rows.map((row) => [row.activityKey, { status: row.status, overall: summarizeRisks(row.risks).overall, updatedAt: row.updatedAt }]));
}

/** Every record of the owner: catalog activities, processor records (platform) and custom activities. */
export async function listRopa(context: RopaContext, options: { withTrashed?: boolean } = {}): Promise<RopaView[]> {
  const [records, dpias] = await Promise.all([listActivityRecords(context.tenantId), dpiaSummaries(context.tenantId)]);
  const byKey = new Map(records.map((record) => [record.activityKey, record]));
  const views: RopaView[] = [];
  for (const activity of activitiesForScope(context.scope)) {
    views.push(buildView(activity.key, "catalog", activity, byKey.get(activity.key), await countStats(activity.stats), dpias.get(activity.key) ?? null, context));
  }
  if (context.scope === "platform") {
    for (const activity of activitiesForScope("tenant")) {
      const key = processorKey(activity.key);
      views.push(buildView(key, "processor", activity, byKey.get(key), await countStats(activity.stats), null, context));
    }
  }
  for (const record of records) {
    if (!isCustomKey(record.activityKey)) continue;
    if (record.deletedAt && !options.withTrashed) continue;
    views.push(buildView(record.activityKey, "custom", undefined, record, [], dpias.get(record.activityKey) ?? null, context));
  }
  return views;
}

/** Custom activities in the trash. */
export async function listTrashedRopa(context: RopaContext): Promise<RopaView[]> {
  const records = await listActivityRecords(context.tenantId);
  return records
    .filter((record) => isCustomKey(record.activityKey) && record.deletedAt)
    .map((record) => buildView(record.activityKey, "custom", undefined, record, [], null, context));
}

function definitionFor(context: RopaContext, key: string): { kind: RopaKind; activity?: ActivityDefinition } {
  if (isCustomKey(key)) return { kind: "custom" };
  if (isProcessorKey(key)) {
    const activity = activityByKey(key.slice(PROCESSOR_PREFIX.length));
    if (context.scope === "platform" && activity?.scope === "tenant") return { kind: "processor", activity };
    throw notFound();
  }
  const activity = activityByKey(key);
  if (!activity || activity.scope !== context.scope) throw notFound();
  return { kind: "catalog", activity };
}

export async function getRopa(context: RopaContext, key: string): Promise<RopaView> {
  const { kind, activity } = definitionFor(context, key);
  const record = await findActivityRecord(context.tenantId, key);
  if (kind === "custom" && (!record || record.deletedAt)) throw notFound();
  const stats = activity ? await countStats(activity.stats) : [];
  const dpiaRow = kind === "processor" ? undefined : await findDpiaRecord(context.tenantId, key);
  const dpia = dpiaRow && !dpiaRow.deletedAt ? { status: dpiaRow.status, overall: summarizeRisks(dpiaRow.risks).overall, updatedAt: dpiaRow.updatedAt } : null;
  return buildView(key, kind, activity, record, stats, dpia, context);
}

// ----- changes -----

const localizedInput = z.record(z.string(), z.string().max(8000, { error: "validation.tooLong" }));

export const ropaUpdateSchema = z.object({
  /** Per field: the text per language; null removes the correction (back to the default). */
  overrides: z.partialRecord(z.enum(ROPA_FIELDS as [RopaField, ...RopaField[]]), localizedInput.nullable()).optional(),
  criteria: z.partialRecord(z.enum(DPIA_CRITERIA), z.boolean().nullable()).optional(),
  assignment: z
    .object({
      picName: z.string().trim().max(120).optional(),
      picRole: z.string().trim().max(120).optional(),
      picEmail: z.union([z.literal(""), z.email({ error: "validation.email" }).max(200)]).optional(),
      unit: z.string().trim().max(120).optional(),
    })
    .optional(),
  status: z.enum(RECORD_STATUSES).optional(),
  /** Marks the record as reviewed now (PP 33/2026 Art. 74(7): keep the record up to date). */
  reviewed: z.boolean().optional(),
});

export type RopaUpdateInput = z.infer<typeof ropaUpdateSchema>;

export async function updateRopa(context: RopaContext, key: string, input: RopaUpdateInput, actorId: number): Promise<RopaView> {
  const { kind } = definitionFor(context, key);
  const record = await findActivityRecord(context.tenantId, key);
  if (kind === "custom" && (!record || record.deletedAt)) throw notFound();

  const overrides: Record<string, LocalizedText> = { ...(record?.overrides ?? {}) };
  let contentChanged = false;
  for (const [field, value] of Object.entries(input.overrides ?? {})) {
    const cleaned = value ? cleanLocalized(value) : {};
    if (Object.keys(cleaned).length === 0) {
      if (field in overrides) contentChanged = true;
      delete overrides[field];
    } else {
      if (JSON.stringify(overrides[field] ?? {}) !== JSON.stringify(cleaned)) contentChanged = true;
      overrides[field] = cleaned;
    }
  }
  if (kind === "custom" && !overrides.name) throw new AppError(422, "errors.ropaNameRequired");

  const criteria = { ...(record?.criteria ?? {}) };
  for (const [criterion, value] of Object.entries(input.criteria ?? {}) as [DpiaCriterion, boolean | null][]) {
    if (value === null) delete criteria[criterion];
    else criteria[criterion] = value;
    contentChanged = true;
  }
  const assignment: RopaAssignment = { ...(record?.assignment ?? {}) };
  for (const [name, value] of Object.entries(input.assignment ?? {}) as [keyof RopaAssignment, string | undefined][]) {
    if (value === undefined) continue;
    if (value === "") delete assignment[name];
    else assignment[name] = value;
    contentChanged = true;
  }
  if (input.status && input.status !== (record?.status ?? "active")) contentChanged = true;

  const now = new Date();
  await upsertActivityRecord(context.tenantId, key, {
    overrides,
    criteria,
    assignment,
    status: input.status ?? record?.status ?? "active",
    version: (record?.version ?? 1) + (contentChanged && record ? 1 : 0),
    updatedBy: actorId,
    ...(input.reviewed ? { reviewedAt: now, reviewedBy: actorId } : {}),
  });
  await recordAudit({
    actorType: "staff",
    actorId,
    action: input.reviewed && !contentChanged ? "ropa.reviewed" : "ropa.updated",
    subjectType: "processing_activity",
    meta: { key, fields: Object.keys(input.overrides ?? {}), scope: context.scope },
  });
  return getRopa(context, key);
}

/** Removes every correction of a catalog record (back to the defaults); custom records keep their name. */
export async function resetRopa(context: RopaContext, key: string, actorId: number): Promise<RopaView> {
  const { kind } = definitionFor(context, key);
  if (kind === "custom") throw new AppError(422, "errors.ropaCustomReset");
  const record = await findActivityRecord(context.tenantId, key);
  if (record) {
    await upsertActivityRecord(context.tenantId, key, { overrides: {}, criteria: {}, assignment: {}, version: record.version + 1, updatedBy: actorId });
    await recordAudit({ actorType: "staff", actorId, action: "ropa.reset", subjectType: "processing_activity", meta: { key, scope: context.scope } });
  }
  return getRopa(context, key);
}

export const ropaCreateSchema = z.object({ name: localizedInput });

export async function createCustomRopa(context: RopaContext, input: z.infer<typeof ropaCreateSchema>, actorId: number): Promise<RopaView> {
  const name = cleanLocalized(input.name);
  if (Object.keys(name).length === 0) throw new AppError(422, "errors.ropaNameRequired");
  const number = (await countCustomActivities(context.tenantId)) + 1;
  const key = `${CUSTOM_PREFIX}${randomString(10).toLowerCase()}`;
  await upsertActivityRecord(context.tenantId, key, {
    code: `RoPA-X${String(number).padStart(2, "0")}`,
    overrides: { name },
    status: "draft",
    updatedBy: actorId,
  });
  await recordAudit({ actorType: "staff", actorId, action: "ropa.created", subjectType: "processing_activity", meta: { key, scope: context.scope } });
  return getRopa(context, key);
}

export async function deleteCustomRopa(context: RopaContext, key: string, actorId: number): Promise<void> {
  if (!isCustomKey(key)) throw new AppError(422, "errors.ropaCatalogDelete");
  const row = await setActivityDeletedAt(context.tenantId, key, new Date());
  if (!row) throw notFound();
  await recordAudit({ actorType: "staff", actorId, action: "ropa.deleted", subjectType: "processing_activity", meta: { key, scope: context.scope } });
}

export async function restoreCustomRopa(context: RopaContext, key: string, actorId: number): Promise<RopaView> {
  if (!isCustomKey(key)) throw notFound();
  const row = await setActivityDeletedAt(context.tenantId, key, null);
  if (!row) throw notFound();
  await recordAudit({ actorType: "staff", actorId, action: "ropa.restored", subjectType: "processing_activity", meta: { key, scope: context.scope } });
  return getRopa(context, key);
}

/** Locales with at least one stored correction, so editors can show which languages were touched. */
export function overrideLocales(view: RopaView): string[] {
  const used = new Set<string>();
  for (const field of Object.values(view.fields)) for (const code of Object.keys(field.override)) used.add(code);
  return LOCALE_CODES.filter((code) => used.has(code));
}

/** Catalog definitions, for screens that list activity keys (incident links, DPIA picker). */
export function catalogKeys(scope: ComplianceScope): string[] {
  return ACTIVITIES.filter((activity) => activity.scope === scope).map((activity) => activity.key);
}
