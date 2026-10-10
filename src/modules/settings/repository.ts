import { and, eq, isNull } from "drizzle-orm";
import { currentTenantId, db, type DbExecutor } from "../../shared/db";
import { appSettings } from "./schema";

/**
 * Settings belong to the tenant of the current scope; outside a tenant scope they are platform-wide
 * (tenant_id null). The explicit tenant condition keeps platform-scope reads from mixing tenants' values.
 */
function ownerCondition() {
  const tenantId = currentTenantId();
  return tenantId === null ? isNull(appSettings.tenantId) : eq(appSettings.tenantId, tenantId);
}

export async function findSetting(key: string, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(appSettings)
    .where(and(eq(appSettings.key, key), ownerCondition(), isNull(appSettings.deletedAt)))
    .limit(1);
  return row;
}

export async function upsertSetting(key: string, value: string, isSecret: boolean, executor?: DbExecutor) {
  await db(executor)
    .insert(appSettings)
    .values({ key, value, isSecret, tenantId: currentTenantId() })
    .onConflictDoUpdate({
      target: [appSettings.tenantId, appSettings.key],
      set: { value, isSecret, deletedAt: null, updatedAt: new Date() },
    });
}
