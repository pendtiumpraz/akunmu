import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { db, type DbExecutor } from "../../shared/db";
import { users } from "../users/schema";

/** The earliest active admin of any workspace: on the desktop, its owner. Needs the platform scope. */
export async function findFirstWorkspaceAdmin(executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(users)
    .where(and(isNotNull(users.tenantId), eq(users.role, "admin"), eq(users.isActive, true), isNull(users.deletedAt)))
    .orderBy(asc(users.id))
    .limit(1);
  return row;
}
