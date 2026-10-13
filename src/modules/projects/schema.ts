import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns, referenceColumn, tenantColumn } from "../../shared/db/columns";

/**
 * Something being worked on (a website, an app, a video series): its name, its address when it has one, and a
 * screenshot of it (Vercel Blob on the web, the local uploads folder on the desktop).
 */
export const projects = pgTable(
  "projects",
  {
    ...baseColumns(),
    tenantId: tenantColumn(),
    name: text("name").notNull(),
    url: text("url"),
    notes: text("notes"),
    /** A Blob URL, or "local:<path>" in the uploads folder; `screenshotPath` is what removes it. */
    screenshotUrl: text("screenshot_url"),
    screenshotPath: text("screenshot_path"),
    screenshotAt: timestamp("screenshot_at", { withTimezone: true }),
    createdBy: referenceColumn("created_by"),
  },
  (table) => [index("projects_tenant_name_index").on(table.tenantId, table.name)],
);

/**
 * A login session working on a project: the session's account, device and place tell who works on it and where.
 * A link that is undone is removed for good (it has no history of its own).
 */
export const projectSessions = pgTable(
  "project_sessions",
  {
    ...baseColumns(),
    tenantId: tenantColumn(),
    projectId: referenceColumn("project_id").notNull(),
    signInId: referenceColumn("sign_in_id").notNull(),
    createdBy: referenceColumn("created_by"),
  },
  (table) => [index("project_sessions_sign_in_index").on(table.signInId), uniqueIndex("project_sessions_unique").on(table.projectId, table.signInId)],
);

export type ProjectRecord = typeof projects.$inferSelect;
export type NewProjectRecord = typeof projects.$inferInsert;
export type ProjectSessionRecord = typeof projectSessions.$inferSelect;
