import { boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { baseColumns, optionalTenantColumn, referenceColumn } from "../../shared/db/columns";
import type { PrivacyRequestStatus, PrivacyRequestType } from "./types";

/**
 * Data subject requests (UU PDP Art. 5–14). A row with a workspace (tenant_id) goes to that workspace's admins;
 * a row without one goes to the AkunMu operator (platform staff).
 */
export const privacyRequests = pgTable(
  "privacy_requests",
  {
    ...baseColumns(),
    tenantId: optionalTenantColumn(),
    /** DSR-<date>-<random>, shown to the requester. */
    code: text("code").notNull(),
    requesterUserId: referenceColumn("requester_user_id"),
    requesterName: text("requester_name").notNull(),
    requesterEmail: text("requester_email").notNull(),
    requestType: text("request_type").$type<PrivacyRequestType>().notNull(),
    description: text("description"),
    status: text("status").$type<PrivacyRequestStatus>().notNull().default("received"),
    /** Received + 3 x 24 hours (UU PDP Art. 30, 32, 40, 41). */
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    response: text("response"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    handledBy: referenceColumn("handled_by"),
    /** "app" when filed by a signed-in user, "staff" when recorded by staff from an email or letter. */
    channel: text("channel").notNull().default("app"),
  },
  (table) => [
    index("privacy_requests_tenant_index").on(table.tenantId, table.createdAt),
    index("privacy_requests_requester_index").on(table.requesterUserId),
  ],
);

/**
 * Proof of consent (PP 33/2026 Art. 36): what a user accepted at sign-up or later, with the policy version.
 * Platform data (AkunMu's operator is the controller of accounts): only the platform scope reads or writes it.
 */
export const accountConsents = pgTable(
  "account_consents",
  {
    ...baseColumns(),
    tenantId: referenceColumn("tenant_id"),
    userId: referenceColumn("user_id").notNull(),
    /** Updated date of the privacy policy and terms the user accepted. */
    policyVersion: text("policy_version").notNull(),
    termsAccepted: boolean("terms_accepted").notNull(),
    marketing: boolean("marketing").notNull().default(false),
    /** Where it was given: "signup" or "settings". */
    source: text("source").notNull(),
    choices: jsonb("choices").$type<Record<string, boolean>>().notNull().default({}),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (table) => [index("account_consents_user_index").on(table.userId, table.createdAt)],
);

export type PrivacyRequestRecord = typeof privacyRequests.$inferSelect;
export type AccountConsentRecord = typeof accountConsents.$inferSelect;
