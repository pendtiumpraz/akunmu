import { z } from "zod";
import { AppError, notFound } from "../../shared/http/errors";
import { patchSchema } from "../../shared/patch-schema";
import { recordAudit } from "../audit/service";
import {
  countIncidentsInYear,
  countOverdueIncidents,
  findIncidentRecord,
  insertIncidentRecord,
  listIncidentRecords,
  updateIncidentRecord,
} from "./repository";
import type { PrivacyIncidentRecord } from "./schema";
import { BREACH_NOTICE_HOURS, INCIDENT_SEVERITIES, INCIDENT_STATUSES, type IncidentDetails } from "./types";

/**
 * Register of personal data protection failures (breaches). Each incident tracks the 3 x 24 hour deadline for
 * notifying the subjects and the authority (UU PDP Art. 46; PP 33/2026 Art. 114), public notice where needed
 * (Art. 115), and the documentation the authority receives (Art. 116).
 */

const instant = z.iso.datetime({ offset: true, error: "validation.invalid" }).transform((value) => new Date(value));
const optionalInstant = instant.nullable().default(null);
const longText = (max: number) => z.string().trim().max(max, { error: "validation.tooLong" }).default("");

export const incidentInputSchema = z.object({
  title: z.string().trim().min(3).max(200),
  severity: z.enum(INCIDENT_SEVERITIES).default("medium"),
  status: z.enum(INCIDENT_STATUSES).default("open"),
  occurredAt: optionalInstant,
  discoveredAt: instant,
  containedAt: optionalInstant,
  subjectsNotifiedAt: optionalInstant,
  authorityNotifiedAt: optionalInstant,
  publicNotifiedAt: optionalInstant,
  closedAt: optionalInstant,
  affectedCount: z.number().int().min(0).max(1_000_000_000).nullable().default(null),
  details: z
    .object({
      description: longText(4000),
      cause: longText(2000),
      dataCategories: longText(2000),
      consequences: longText(4000),
      measures: longText(4000),
      notificationNote: longText(2000),
      reporterName: longText(120),
      activityKeys: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
    })
    .default({ description: "", cause: "", dataCategories: "", consequences: "", measures: "", notificationNote: "", reporterName: "", activityKeys: [] }),
});

export const incidentUpdateSchema = patchSchema(incidentInputSchema);

export type IncidentInput = z.infer<typeof incidentInputSchema>;
export type IncidentUpdate = z.output<typeof incidentUpdateSchema>;

export function noticeDeadline(discoveredAt: Date): Date {
  return new Date(discoveredAt.getTime() + BREACH_NOTICE_HOURS * 3_600_000);
}

export type IncidentView = PrivacyIncidentRecord & {
  /** Hours left until the notification deadline (negative when overdue), while notices are still owed. */
  hoursLeft: number | null;
  overdue: boolean;
};

export function incidentView(row: PrivacyIncidentRecord, now = new Date()): IncidentView {
  const owed = !row.closedAt && (!row.subjectsNotifiedAt || !row.authorityNotifiedAt);
  const hoursLeft = owed ? Math.floor((row.noticeDeadlineAt.getTime() - now.getTime()) / 3_600_000) : null;
  return { ...row, hoursLeft, overdue: hoursLeft !== null && hoursLeft < 0 };
}

export async function listIncidents(tenantId: number | null, query: { search?: string; trashed?: boolean; page: number; perPage: number }) {
  const { items, total } = await listIncidentRecords(tenantId, query);
  return { items: items.map((row) => incidentView(row)), total };
}

export async function getIncident(tenantId: number | null, id: number): Promise<IncidentView> {
  const row = await findIncidentRecord(tenantId, id);
  if (!row) throw notFound();
  return incidentView(row);
}

function checkTimeline(values: { discoveredAt?: Date; occurredAt?: Date | null; containedAt?: Date | null; closedAt?: Date | null }) {
  if (values.discoveredAt && values.occurredAt && values.occurredAt > values.discoveredAt) {
    throw new AppError(422, "errors.incidentTimeline");
  }
  if (values.discoveredAt && values.discoveredAt.getTime() > Date.now() + 5 * 60_000) throw new AppError(422, "errors.incidentFuture");
}

export async function createIncident(tenantId: number | null, input: IncidentInput, actorId: number): Promise<IncidentView> {
  checkTimeline(input);
  const year = input.discoveredAt.getUTCFullYear();
  const number = (await countIncidentsInYear(tenantId, year)) + 1;
  const details: IncidentDetails = { ...input.details };
  const row = await insertIncidentRecord({
    tenantId,
    code: `INC-${year}-${String(number).padStart(3, "0")}`,
    title: input.title,
    severity: input.severity,
    status: input.status,
    occurredAt: input.occurredAt,
    discoveredAt: input.discoveredAt,
    noticeDeadlineAt: noticeDeadline(input.discoveredAt),
    containedAt: input.containedAt,
    subjectsNotifiedAt: input.subjectsNotifiedAt,
    authorityNotifiedAt: input.authorityNotifiedAt,
    publicNotifiedAt: input.publicNotifiedAt,
    closedAt: input.closedAt,
    affectedCount: input.affectedCount,
    details,
    updatedBy: actorId,
  });
  await recordAudit({ actorType: "staff", actorId, action: "incident.created", subjectType: "privacy_incident", subjectId: row.id, meta: { code: row.code, severity: row.severity } });
  return incidentView(row);
}

export async function updateIncident(tenantId: number | null, id: number, input: IncidentUpdate, actorId: number): Promise<IncidentView> {
  const row = await findIncidentRecord(tenantId, id);
  if (!row) throw notFound();
  const discoveredAt = input.discoveredAt ?? row.discoveredAt;
  checkTimeline({ discoveredAt, occurredAt: input.occurredAt === undefined ? row.occurredAt : input.occurredAt });
  const { details, ...rest } = input;
  const updated = await updateIncidentRecord(id, {
    ...rest,
    ...(details ? { details: { ...row.details, ...details } } : {}),
    noticeDeadlineAt: noticeDeadline(discoveredAt),
    updatedBy: actorId,
  });
  if (!updated) throw notFound();
  await recordAudit({ actorType: "staff", actorId, action: "incident.updated", subjectType: "privacy_incident", subjectId: id, meta: { fields: Object.keys(input) } });
  return incidentView(updated);
}

export async function deleteIncident(tenantId: number | null, id: number, actorId: number): Promise<void> {
  const row = await findIncidentRecord(tenantId, id);
  if (!row) throw notFound();
  await updateIncidentRecord(id, { deletedAt: new Date() });
  await recordAudit({ actorType: "staff", actorId, action: "incident.deleted", subjectType: "privacy_incident", subjectId: id });
}

export async function restoreIncident(tenantId: number | null, id: number, actorId: number): Promise<IncidentView> {
  const row = await findIncidentRecord(tenantId, id, { withTrashed: true });
  if (!row || !row.deletedAt) throw notFound();
  const restored = await updateIncidentRecord(id, { deletedAt: null });
  if (!restored) throw notFound();
  await recordAudit({ actorType: "staff", actorId, action: "incident.restored", subjectType: "privacy_incident", subjectId: id });
  return incidentView(restored);
}

export function overdueIncidents(tenantId: number | null): Promise<number> {
  return countOverdueIncidents(tenantId);
}
