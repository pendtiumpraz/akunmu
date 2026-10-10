import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseUrl } from "../env";
import * as schema from "./schema";
import { SCOPE_STATEMENT, scopeParameters } from "./scope";

/**
 * The only file that knows the PostgreSQL driver (DATABASE-RULES: database-agnostic repository layer).
 * Repositories receive a `Database` and use the Drizzle query builder only.
 */
export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Connection-string parameters that libpq understands but postgres.js would forward to the server
 * as session settings (Neon adds channel_binding=require). TLS stays enforced through sslmode.
 */
const CLIENT_ONLY_PARAMETERS = ["channel_binding"];

export function normalizeConnectionString(url: string): string {
  const parsed = new URL(url);
  for (const name of CLIENT_ONLY_PARAMETERS) parsed.searchParams.delete(name);
  return parsed.toString();
}

type TransactionCallback = (transaction: postgres.TransactionSql) => unknown;

/**
 * Wraps a postgres.js client so that every statement and every transaction runs inside the current
 * data scope (see scope.ts): BEGIN, the scope settings, the statement(s), COMMIT. The scope is captured
 * synchronously when Drizzle issues the statement, before postgres.js queues it.
 */
function scopedClient(client: postgres.Sql): postgres.Sql {
  const begin = (...args: [TransactionCallback] | [string, TransactionCallback]) => {
    const parameters = scopeParameters();
    const callback = args[args.length - 1] as TransactionCallback;
    const scoped = async (transaction: postgres.TransactionSql) => {
      await transaction.unsafe(SCOPE_STATEMENT, parameters);
      return callback(transaction);
    };
    return args.length === 2 ? client.begin(args[0] as string, scoped) : client.begin(scoped);
  };
  const unsafe = (query: string, values?: postgres.ParameterOrJSON<never>[], options?: postgres.UnsafeQueryOptions) => {
    const parameters = scopeParameters();
    // Results travel wrapped in an object: postgres.js would otherwise await a returned array element-wise
    // and drop the row list's extra fields (count, columns).
    const run = <T>(read: (transaction: postgres.TransactionSql) => Promise<T>) =>
      client
        .begin(async (transaction) => {
          await transaction.unsafe(SCOPE_STATEMENT, parameters);
          return { result: await read(transaction) };
        })
        .then((wrapped) => (wrapped as unknown as { result: T }).result);
    return {
      then<A, B>(onFulfilled?: (rows: postgres.RowList<postgres.Row[]>) => A, onRejected?: (reason: unknown) => B) {
        return run((transaction) => Promise.resolve(transaction.unsafe(query, values, options))).then(onFulfilled, onRejected);
      },
      values() {
        return run((transaction) => Promise.resolve(transaction.unsafe(query, values, options).values()));
      },
    };
  };
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "begin") return begin;
      if (property === "unsafe") return unsafe;
      return Reflect.get(target, property, receiver);
    },
  });
}

/** `db` runs inside data scopes (row level security); `owner` bypasses them and is for migrations only. */
type DatabaseHolder = { db: Database; owner: Database; close: () => Promise<void> };

const globalHolder = globalThis as typeof globalThis & { __akunmuDb?: DatabaseHolder };

export function createDatabase(url: string, options: { maxConnections?: number } = {}): DatabaseHolder {
  const configuredMax = Number(process.env.DATABASE_POOL_MAX);
  const client = postgres(normalizeConnectionString(url), {
    // Serverless functions keep one connection; the Neon pooler (PgBouncer) does the pooling.
    max: options.maxConnections ?? (configuredMax > 0 ? configuredMax : process.env.VERCEL ? 1 : 5),
    // Transaction-mode poolers do not support prepared statements.
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
  });
  return {
    db: drizzle(scopedClient(client), { schema }),
    owner: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}

function holder(): DatabaseHolder {
  if (!globalHolder.__akunmuDb) globalHolder.__akunmuDb = createDatabase(databaseUrl());
  return globalHolder.__akunmuDb;
}

/** Database handle for application code; every statement runs in the current data scope. */
export function getDb(): Database {
  return holder().db;
}

/** Unscoped handle that bypasses row level security. Migrations and maintenance scripts only. */
export function getOwnerDb(): Database {
  return holder().owner;
}

/** Replaces the active database (tests use PGlite, scripts use the unpooled URL). */
export function setActiveDatabase(db: Database, close: () => Promise<void> = async () => {}, owner: Database = db): void {
  globalHolder.__akunmuDb = { db, owner, close };
}

export async function closeDb(): Promise<void> {
  const current = globalHolder.__akunmuDb;
  globalHolder.__akunmuDb = undefined;
  if (current) await current.close();
}
