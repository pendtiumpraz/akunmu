import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { db, type DbExecutor } from "../../shared/db";
import { users } from "../users/schema";

const activeAdmin = and(eq(users.role, "admin"), eq(users.isActive, true), isNull(users.deletedAt));

/** The earliest active admin of any workspace: on the desktop, the default user. Needs the platform scope. */
export async function findFirstWorkspaceAdmin(executor?: DbExecutor) {
  const [row] = await db(executor).select().from(users).where(and(isNotNull(users.tenantId), activeAdmin)).orderBy(asc(users.id)).limit(1);
  return row;
}

/** The earliest active platform admin: on the desktop, the default superadmin. Needs the platform scope. */
export async function findFirstPlatformAdmin(executor?: DbExecutor) {
  const [row] = await db(executor).select().from(users).where(and(isNull(users.tenantId), activeAdmin)).orderBy(asc(users.id)).limit(1);
  return row;
}
