import { index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import type { LocalizedText } from "../../shared/i18n/localized";
import { baseColumns, optionalTenantColumn, referenceColumn } from "../../shared/db/columns";
import type { DpiaCriterion } from "./catalog";
import type {
  DpiaDecision,
  DpiaRisk,
  DpiaSignoff,
  DpiaStatus,
  DpiaThreshold,
  IncidentDetails,
  IncidentSeverity,
  IncidentStatus,
  RecordStatus,
  RopaAssignment,
} from "./types";

/*
 * Records of processing activities (RoPA), data protection impact assessments (DPIA) and the breach register.
 * A null tenant_id marks the platform's own records (EventMu's operator as controller or processor); tenant
 * rows belong to the organizer. Row level security only shows the current tenant's rows (or every row in the
 * platform scope, where queries add `tenant_id is null` themselves).
 */

export const processingActivities = pgTable(
  "processing_activities",
  {
    ...baseColumns(),
    tenantId: optionalTenantColumn(),
    /** Catalog key, `processor:<key>` for the platform's processor records, or `custom-<id>`. */
    activityKey: text("activity_key").notNull(),
    /** Registration number of custom activities (catalog records derive theirs from the catalog code). */
    code: text("code"),
    status: text("status").$type<RecordStatus>().notNull().default("active"),
    /** Staff corrections per field and language; they win over the catalog defaults. */
    overrides: jsonb("overrides").$type<Record<string, LocalizedText>>().notNull().default({}),
    /** DPIA criteria answered by staff (custom records, or corrections of the catalog's criteria). */
    criteria: jsonb("criteria").$type<Partial<Record<DpiaCriterion, boolean>>>().notNull().default({}),
    assignment: jsonb("assignment").$type<RopaAssignment>().notNull().default({}),
    version: integer("version").notNull().default(1),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: referenceColumn("reviewed_by"),
    updatedBy: referenceColumn("updated_by"),
  },
  // One record per activity and owner; the platform's rows have no tenant (NULLS NOT DISTINCT keeps them unique).
  (table) => [unique("processing_activities_owner_key_unique").on(table.tenantId, table.activityKey).nullsNotDistinct()],
);

export const dpiaAssessments = pgTable(
  "dpia_assessments",
  {
    ...baseColumns(),
    tenantId: optionalTenantColumn(),
    activityKey: text("activity_key").notNull(),
    status: text("status").$type<DpiaStatus>().notNull().default("draft"),
    threshold: jsonb("threshold").$type<DpiaThreshold>().notNull().default({}),
    content: jsonb("content").$type<Record<string, LocalizedText>>().notNull().default({}),
    risks: jsonb("risks").$type<DpiaRisk[]>().notNull().default([]),
    decision: text("decision").$type<DpiaDecision>(),
    signoff: jsonb("signoff").$type<DpiaSignoff>().notNull().default({}),
    version: integer("version").notNull().default(1),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: referenceColumn("approved_by"),
    updatedBy: referenceColumn("updated_by"),
  },
  (table) => [unique("dpia_assessments_owner_key_unique").on(table.tenantId, table.activityKey).nullsNotDistinct()],
);

export const privacyIncidents = pgTable(
  "privacy_incidents",
  {
    ...baseColumns(),
    tenantId: optionalTenantColumn(),
    /** INC-<year>-<number>, unique per owner. */
    code: text("code").notNull(),
    title: text("title").notNull(),
    status: text("status").$type<IncidentStatus>().notNull().default("open"),
    severity: text("severity").$type<IncidentSeverity>().notNull().default("medium"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull(),
    /** discovered_at + 3 x 24 hours (UU PDP Art. 46; PP 33/2026 Art. 114). */
    noticeDeadlineAt: timestamp("notice_deadline_at", { withTimezone: true }).notNull(),
    containedAt: timestamp("contained_at", { withTimezone: true }),
    subjectsNotifiedAt: timestamp("subjects_notified_at", { withTimezone: true }),
    authorityNotifiedAt: timestamp("authority_notified_at", { withTimezone: true }),
    publicNotifiedAt: timestamp("public_notified_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    affectedCount: integer("affected_count"),
    details: jsonb("details").$type<IncidentDetails>().notNull().default({}),
    updatedBy: referenceColumn("updated_by"),
  },
  (table) => [
    unique("privacy_incidents_owner_code_unique").on(table.tenantId, table.code).nullsNotDistinct(),
    index("privacy_incidents_discovered_index").on(table.tenantId, table.discoveredAt),
  ],
);

export type ProcessingActivityRecord = typeof processingActivities.$inferSelect;
export type DpiaAssessmentRecord = typeof dpiaAssessments.$inferSelect;
export type PrivacyIncidentRecord = typeof privacyIncidents.$inferSelect;
