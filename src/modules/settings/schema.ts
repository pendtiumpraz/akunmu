import { boolean, pgTable, text, unique } from "drizzle-orm/pg-core";
import { baseColumns, optionalTenantColumn } from "../../shared/db/columns";

/** Key/value application settings. Secret values are stored encrypted (see shared/crypto/secret-box). */
export const appSettings = pgTable(
  "app_settings",
  {
    ...baseColumns(),
    tenantId: optionalTenantColumn(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    isSecret: boolean("is_secret").notNull().default(false),
  },
  // One value per key and tenant; the platform-wide value has no tenant (NULLS NOT DISTINCT keeps it unique).
  (table) => [unique("app_settings_tenant_key_unique").on(table.tenantId, table.key).nullsNotDistinct()],
);

export type AppSettingRecord = typeof appSettings.$inferSelect;
