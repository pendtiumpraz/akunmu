/**
 * Applies SQL migrations from drizzle/migrations using the direct (unpooled) connection.
 * Runs locally with `npm run db:migrate` and on Vercel inside `vercel-build`.
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "../src/shared/db/client";
import { migrationDatabaseUrl } from "../src/shared/env";

// Migrations run as the connection owner: they create the RLS role and policies themselves.
const { owner: db, close } = createDatabase(migrationDatabaseUrl(), { maxConnections: 1 });

try {
  await migrate(db, { migrationsFolder: "drizzle/migrations" });
  console.log("Migrations applied.");
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await close();
}
