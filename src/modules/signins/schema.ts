import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns, referenceColumn, tenantColumn } from "../../shared/db/columns";
import type { SignInStatus } from "./types";

/**
 * An account signed in somewhere: in a browser profile of a device, or on the device itself (the system or an
 * app, `profileId` null and `app` naming it). Signing out keeps the row as history ("signed_out").
 */
export const signIns = pgTable(
  "sign_ins",
  {
    ...baseColumns(),
    tenantId: tenantColumn(),
    accountId: referenceColumn("account_id").notNull(),
    deviceId: referenceColumn("device_id").notNull(),
    profileId: referenceColumn("profile_id"),
    app: text("app"),
    status: text("status").$type<SignInStatus>().notNull().default("signed_in"),
    /** Local date (YYYY-MM-DD) the account was signed in there, when known. */
    since: text("since"),
    /** When someone last confirmed the account is still signed in there. */
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }).notNull().defaultNow(),
    signedOutAt: timestamp("signed_out_at", { withTimezone: true }),
    /** Marked to check or sign out soon. */
    review: boolean("review").notNull().default(false),
    notes: text("notes"),
    createdBy: referenceColumn("created_by"),
  },
  (table) => [
    index("sign_ins_account_index").on(table.accountId),
    index("sign_ins_device_index").on(table.deviceId),
    index("sign_ins_profile_index").on(table.profileId),
    // One active sign-in per account and place (profile, or app on the device).
    uniqueIndex("sign_ins_active_place_unique")
      .on(table.accountId, table.deviceId, sql`coalesce(${table.profileId}, 0)`, sql`lower(coalesce(${table.app}, ''))`)
      .where(sql`${table.deletedAt} is null and ${table.status} = 'signed_in'`),
  ],
);

export type SignInRecord = typeof signIns.$inferSelect;
export type NewSignInRecord = typeof signIns.$inferInsert;
