import { sql } from "drizzle-orm";
import { db, type DbExecutor } from "../../shared/db";
import { tooManyRequests } from "../../shared/http/errors";
import { rateLimits } from "./schema";

export type RateLimitResult = { allowed: boolean; hits: number; resetAt: Date };

/**
 * Fixed-window counter stored in PostgreSQL so every serverless instance shares it.
 * One atomic upsert: a new window starts once reset_at has passed.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  executor?: DbExecutor,
): Promise<RateLimitResult> {
  const resetAt = new Date(Date.now() + windowSeconds * 1000);
  const [row] = await db(executor)
    .insert(rateLimits)
    .values({ key, hits: 1, resetAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        hits: sql`case when ${rateLimits.resetAt} <= now() then 1 else ${rateLimits.hits} + 1 end`,
        resetAt: sql`case when ${rateLimits.resetAt} <= now() then excluded.reset_at else ${rateLimits.resetAt} end`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ hits: rateLimits.hits, resetAt: rateLimits.resetAt });
  return { allowed: row.hits <= limit, hits: row.hits, resetAt: row.resetAt };
}

/** Throws HTTP 429 when the limit is exceeded. */
export async function enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const result = await consumeRateLimit(key, limit, windowSeconds);
  if (!result.allowed) throw tooManyRequests();
}
