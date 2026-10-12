import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { baseColumns, referenceColumn, tenantColumn } from "../../shared/db/columns";
import type { DeviceKind, DeviceSystem, ProfileClient } from "./types";

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
    /** The computer's host name (lowercase), when the desktop app recorded it: how a scan knows "this computer". */
    hostname: text("hostname"),
    createdBy: referenceColumn("created_by"),
  },
  (table) => [index("devices_tenant_name_index").on(table.tenantId, table.name)],
);

/**
 * A browser profile on one device ("Work" in Chrome), or a command-line tool's profile (a Claude Code account run as
 * `claude-work` from ~/.claude-work): `browser` names the browser or the tool. The same profile name on another device
 * is another row: each device keeps its own sign-ins. `syncAccountId` is the account a browser profile syncs with.
 */
export const browserProfiles = pgTable(
  "browser_profiles",
  {
    ...baseColumns(),
    tenantId: tenantColumn(),
    deviceId: referenceColumn("device_id").notNull(),
    browser: text("browser").$type<ProfileClient>().notNull().default("chrome"),
    name: text("name").notNull(),
    syncAccountId: referenceColumn("sync_account_id"),
    color: text("color"),
    notes: text("notes"),
    /**
     * The profile's folder: the browser's own ("Profile 3", found by a desktop scan; opens sites in it), or a
     * command-line profile's config folder (~/.claude-work).
     */
    directory: text("directory"),
    createdBy: referenceColumn("created_by"),
  },
  (table) => [index("browser_profiles_device_index").on(table.deviceId)],
);

export type DeviceRecord = typeof devices.$inferSelect;
export type NewDeviceRecord = typeof devices.$inferInsert;
export type BrowserProfileRecord = typeof browserProfiles.$inferSelect;
export type NewBrowserProfileRecord = typeof browserProfiles.$inferInsert;
