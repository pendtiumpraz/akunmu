import { and, asc, count, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, likePattern, softDeleteScope, type DbExecutor } from "../../shared/db";
import { accounts, providers, type NewAccountRecord, type NewProviderRecord } from "./schema";

/** Active sign-ins of an account, as a correlated subquery. */
const ACTIVE_SIGN_INS = sql<number>`(select count(*)::int from "sign_ins" s where s."account_id" = "accounts"."id" and s."deleted_at" is null and s."status" = 'signed_in')`;

// ----- providers -----

export async function listProviders(options: { trashed?: boolean } = {}, executor?: DbExecutor) {
  return db(executor)
    .select({
      provider: providers,
      accountCount: sql<number>`(select count(*)::int from "accounts" a where a."provider_id" = "providers"."id" and a."deleted_at" is null)`,
    })
    .from(providers)
    .where(softDeleteScope(providers.deletedAt, options.trashed))
    .orderBy(asc(providers.name));
}

export async function findProviderById(id: number, options: { withTrashed?: boolean } = {}, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(providers)
    .where(options.withTrashed ? eq(providers.id, id) : and(eq(providers.id, id), isNull(providers.deletedAt)))
    .limit(1);
  return row;
}

export async function providerSlugs(executor?: DbExecutor): Promise<Set<string>> {
  const rows = await db(executor).select({ slug: providers.slug }).from(providers).where(isNull(providers.deletedAt));
  return new Set(rows.map((row) => row.slug));
}

export async function insertProviders(values: NewProviderRecord[], executor?: DbExecutor) {
  if (values.length === 0) return [];
  return db(executor).insert(providers).values(values).onConflictDoNothing().returning();
}

export async function updateProvider(id: number, changes: Partial<NewProviderRecord>, executor?: DbExecutor) {
  const [row] = await db(executor).update(providers).set(changes).where(eq(providers.id, id)).returning();
  return row;
}

export async function countAccountsOfProvider(providerId: number): Promise<number> {
  const [row] = await db()
    .select({ total: count() })
    .from(accounts)
    .where(and(eq(accounts.providerId, providerId), isNull(accounts.deletedAt)));
  return row.total;
}

// ----- accounts -----

export type AccountListQuery = { search?: string; providerId?: number; trashed?: boolean; page: number; perPage: number };

export async function listAccounts(query: AccountListQuery) {
  const pattern = query.search ? likePattern(query.search) : null;
  const where: SQL | undefined = and(
    softDeleteScope(accounts.deletedAt, query.trashed),
    query.providerId ? eq(accounts.providerId, query.providerId) : undefined,
    pattern ? or(ilike(accounts.identifier, pattern), ilike(accounts.label, pattern), ilike(providers.name, pattern)) : undefined,
  );
  const [items, [{ total }]] = await Promise.all([
    db()
      .select({ account: accounts, provider: providers, activeSignIns: ACTIVE_SIGN_INS })
      .from(accounts)
      .innerJoin(providers, eq(providers.id, accounts.providerId))
      .where(where)
      .orderBy(asc(providers.name), asc(sql`lower(${accounts.identifier})`))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db().select({ total: count() }).from(accounts).innerJoin(providers, eq(providers.id, accounts.providerId)).where(where),
  ]);
  return { items, total };
}

export async function findAccountById(id: number, options: { withTrashed?: boolean } = {}, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(accounts)
    .where(options.withTrashed ? eq(accounts.id, id) : and(eq(accounts.id, id), isNull(accounts.deletedAt)))
    .limit(1);
  return row;
}

export async function findAccountByIdentifier(providerId: number, identifier: string, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(accounts)
    .where(and(eq(accounts.providerId, providerId), sql`lower(${accounts.identifier}) = lower(${identifier})`, isNull(accounts.deletedAt)))
    .limit(1);
  return row;
}

/** Accounts whose identifier or label matches, across providers (the assistant's "where is x@gmail.com signed in"). */
export async function findAccountsByText(text: string, options: { providerId?: number; limit?: number } = {}) {
  const pattern = likePattern(text);
  return db()
    .select({ account: accounts, provider: providers })
    .from(accounts)
    .innerJoin(providers, eq(providers.id, accounts.providerId))
    .where(
      and(
        isNull(accounts.deletedAt),
        options.providerId ? eq(accounts.providerId, options.providerId) : undefined,
        or(ilike(accounts.identifier, pattern), ilike(accounts.label, pattern)),
      ),
    )
    .orderBy(asc(sql`lower(${accounts.identifier})`))
    .limit(options.limit ?? 10);
}

export async function insertAccount(values: NewAccountRecord, executor?: DbExecutor) {
  const [row] = await db(executor).insert(accounts).values(values).returning();
  return row;
}

export async function updateAccount(id: number, changes: Partial<NewAccountRecord>, executor?: DbExecutor) {
  const [row] = await db(executor).update(accounts).set(changes).where(eq(accounts.id, id)).returning();
  return row;
}

export async function countAccounts(): Promise<number> {
  const [row] = await db().select({ total: count() }).from(accounts).where(isNull(accounts.deletedAt));
  return row.total;
}
