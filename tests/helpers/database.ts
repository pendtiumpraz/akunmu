import { PGlite, type Transaction } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { seedBuiltInProviders } from "@/modules/accounts/service";
import { tenants } from "@/modules/tenants/schema";
import { closeDb, inTenant, setActiveDatabase, type Database } from "@/shared/db";
import * as schema from "@/shared/db/schema";
import { SCOPE_STATEMENT, scopeParameters, setFallbackScope } from "@/shared/db/scope";

/**
 * PGlite counterpart of the scoped postgres.js client (src/shared/db/client.ts): every statement and
 * transaction runs as akunmu_app with the current scope settings, so tests exercise row level security.
 */
function scopedPglite(client: PGlite): PGlite {
  const transaction = <T>(callback: (tx: Transaction) => Promise<T>) => {
    const parameters = scopeParameters();
    return client.transaction(async (tx) => {
      await tx.query(SCOPE_STATEMENT, parameters);
      return callback(tx);
    });
  };
  const query = (text: string, parameters?: unknown[], options?: Parameters<PGlite["query"]>[2]) =>
    transaction((tx) => tx.query(text, parameters, options));
  return new Proxy(client, {
    get(target, property) {
      if (property === "transaction") return transaction;
      if (property === "query") return query;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export type TestDatabase = { db: Database; owner: Database; tenantId: number; close: () => Promise<void> };

/**
 * Fresh in-memory PostgreSQL (PGlite) with every migration applied and one workspace ("test") with the built-in
 * providers. Tests run in that workspace's scope unless they switch with inTenant()/asPlatform().
 */
export async function openTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const owner = drizzle(client, { schema }) as unknown as Database;
  await migrate(drizzle(client, { schema }), { migrationsFolder: "drizzle/migrations" });
  const db = drizzle(scopedPglite(client), { schema }) as unknown as Database;
  setActiveDatabase(
    db,
    async () => {
      await client.close();
    },
    owner,
  );
  const [tenant] = await owner.insert(tenants).values({ slug: "test", name: "Test workspace", contactEmail: "owner@example.com" }).returning();
  setFallbackScope({ tenantId: tenant.id, platform: false });
  await seedBuiltInProviders();
  return {
    db,
    owner,
    tenantId: tenant.id,
    close: async () => {
      setFallbackScope(null);
      await closeDb();
    },
  };
}

/** Creates another workspace (bypassing RLS, as the platform would) with the built-in providers; returns its id. */
export async function createTestTenant(owner: Database, slug: string): Promise<number> {
  const [tenant] = await owner.insert(tenants).values({ slug, name: `Workspace ${slug}`, contactEmail: `${slug}@example.com` }).returning();
  await inTenant(tenant.id, () => seedBuiltInProviders());
  return tenant.id;
}
