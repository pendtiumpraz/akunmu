import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { baseColumns, referenceColumn, tenantColumn } from "../../shared/db/columns";
import type { Browser, DeviceKind, DeviceSystem } from "./types";

/** A laptop, PC, phone or tablet where accounts are signed in. */
export const devices = pgTable(
  "devices",
  {
    ...baseColumns(),
    tenantId: tenantColumn(),
    name: text("name").notNull(),
    kind: text("kind").$type<DeviceKind>().notNull().default("laptop"),
    system: text("system").$type<DeviceSystem>().notNull().default("other"),
    /** Where the device usually is, e.g. "Office" or "Home". */
    location: text("location"),
    notes: text("notes"),
    /** When someone last went through this device's sign-ins. */
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdBy: referenceColumn("created_by"),
  },
  (table) => [index("devices_tenant_name_index").on(table.tenantId, table.name)],
);

/**
 * A browser profile on one device ("Work" in Chrome). The same profile name on another device is another
 * row: each device keeps its own sign-ins. `syncAccountId` is the account the profile syncs with, if any.
 */
export const browserProfiles = pgTable(
  "browser_profiles",
  {
    ...baseColumns(),
    tenantId: tenantColumn(),
    deviceId: referenceColumn("device_id").notNull(),
    browser: text("browser").$type<Browser>().notNull().default("chrome"),
    name: text("name").notNull(),
    syncAccountId: referenceColumn("sync_account_id"),
    color: text("color"),
    notes: text("notes"),
    createdBy: referenceColumn("created_by"),
  },
  (table) => [index("browser_profiles_device_index").on(table.deviceId)],
);

export type DeviceRecord = typeof devices.$inferSelect;
export type NewDeviceRecord = typeof devices.$inferInsert;
export type BrowserProfileRecord = typeof browserProfiles.$inferSelect;
export type NewBrowserProfileRecord = typeof browserProfiles.$inferInsert;
