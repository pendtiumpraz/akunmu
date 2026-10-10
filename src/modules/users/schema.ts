import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns, referenceColumn, optionalTenantColumn } from "../../shared/db/columns";
import type { StaffRole } from "./roles";

export { STAFF_ROLES, type StaffRole } from "./roles";

export const users = pgTable(
  "users",
  {
    ...baseColumns(),
    tenantId: optionalTenantColumn(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<StaffRole>().notNull().default("editor"),
    locale: text("locale"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("users_email_active_unique")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.deletedAt} is null`),
    index("users_tenant_id_index").on(table.tenantId),
  ],
);

export const staffSessions = pgTable(
  "staff_sessions",
  {
    ...baseColumns(),
    userId: referenceColumn("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    userAgent: text("user_agent"),
  },
  (table) => [
    uniqueIndex("staff_sessions_token_hash_unique").on(table.tokenHash),
    index("staff_sessions_user_id_index").on(table.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type StaffSession = typeof staffSessions.$inferSelect;
