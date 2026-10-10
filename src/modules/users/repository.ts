import { and, count, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import { db, likePattern, ownedByScope, softDeleteScope, type DbExecutor } from "../../shared/db";
import { staffSessions, users, type NewUser, type User } from "./schema";

export type UserListQuery = { search?: string; trashed?: boolean; page: number; perPage: number };

export async function findUserById(id: number, options: { withTrashed?: boolean } = {}, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(users)
    .where(options.withTrashed ? eq(users.id, id) : and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return row;
}

export async function findActiveUserByEmail(email: string, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email.toLowerCase()}`, isNull(users.deletedAt)))
    .limit(1);
  return row;
}

export async function listUsers(query: UserListQuery, executor?: DbExecutor) {
  const where = and(
    ownedByScope(users.tenantId),
    softDeleteScope(users.deletedAt, query.trashed),
    query.search ? or(ilike(users.name, likePattern(query.search)), ilike(users.email, likePattern(query.search))) : undefined,
  );
  const [items, [{ total }]] = await Promise.all([
    db(executor)
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db(executor).select({ total: count() }).from(users).where(where),
  ]);
  return { items, total };
}

export async function insertUser(values: NewUser, executor?: DbExecutor): Promise<User> {
  const [row] = await db(executor).insert(users).values(values).returning();
  return row;
}

export async function updateUser(id: number, values: Partial<NewUser>, executor?: DbExecutor) {
  const [row] = await db(executor)
    .update(users)
    .set(values)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .returning();
  return row;
}

export async function softDeleteUser(id: number, executor?: DbExecutor) {
  const [row] = await db(executor)
    .update(users)
    .set({ deletedAt: new Date() })
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .returning();
  return row;
}

export async function restoreUser(id: number, executor?: DbExecutor) {
  const [row] = await db(executor)
    .update(users)
    .set({ deletedAt: null })
    .where(and(eq(users.id, id), sql`${users.deletedAt} is not null`))
    .returning();
  return row;
}

export async function countActiveAdmins(executor?: DbExecutor): Promise<number> {
  const [{ total }] = await db(executor)
    .select({ total: count() })
    .from(users)
    .where(and(ownedByScope(users.tenantId), eq(users.role, "admin"), eq(users.isActive, true), isNull(users.deletedAt)));
  return total;
}

export async function countUsers(executor?: DbExecutor): Promise<number> {
  const [{ total }] = await db(executor).select({ total: count() }).from(users).where(isNull(users.deletedAt));
  return total;
}

/** Platform staff (AkunMu owner console) have no tenant. Needs the platform scope. */
export async function countPlatformUsers(executor?: DbExecutor): Promise<number> {
  const [{ total }] = await db(executor).select({ total: count() }).from(users).where(and(isNull(users.deletedAt), isNull(users.tenantId)));
  return total;
}

// ----- staff sessions -----

export async function insertSession(
  values: { userId: number; tokenHash: string; expiresAt: Date; userAgent: string | null },
  executor?: DbExecutor,
) {
  const [row] = await db(executor).insert(staffSessions).values(values).returning();
  return row;
}

/** Session with its user, only when both are active and the session has not expired. */
export async function findValidSession(tokenHash: string, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select({ session: staffSessions, user: users })
    .from(staffSessions)
    .innerJoin(users, eq(users.id, staffSessions.userId))
    .where(
      and(
        eq(staffSessions.tokenHash, tokenHash),
        isNull(staffSessions.deletedAt),
        gt(staffSessions.expiresAt, new Date()),
        isNull(users.deletedAt),
        eq(users.isActive, true),
      ),
    )
    .limit(1);
  return row;
}

export async function touchSession(id: number, executor?: DbExecutor) {
  await db(executor).update(staffSessions).set({ lastUsedAt: new Date() }).where(eq(staffSessions.id, id));
}

export async function revokeSessionByHash(tokenHash: string, executor?: DbExecutor) {
  await db(executor)
    .update(staffSessions)
    .set({ deletedAt: new Date() })
    .where(and(eq(staffSessions.tokenHash, tokenHash), isNull(staffSessions.deletedAt)));
}

export async function revokeSessionsForUser(userId: number, executor?: DbExecutor) {
  await db(executor)
    .update(staffSessions)
    .set({ deletedAt: new Date() })
    .where(and(eq(staffSessions.userId, userId), isNull(staffSessions.deletedAt)));
}

/** Signs every staff member of a tenant out (tenant suspended or deleted). Needs the platform scope. */
export async function revokeSessionsOfTenant(tenantId: number, executor?: DbExecutor) {
  await db(executor)
    .delete(staffSessions)
    .where(sql`${staffSessions.userId} in (select ${users.id} from ${users} where ${users.tenantId} = ${tenantId})`);
}
