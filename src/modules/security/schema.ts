import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "../../shared/db/columns";

/** Fixed-window rate limit counters, shared by every serverless instance. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    ...baseColumns(),
    key: text("key").notNull(),
    hits: integer("hits").notNull().default(0),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("rate_limits_key_unique").on(table.key)],
);
