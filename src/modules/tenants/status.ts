import type { TenantRecord } from "./schema";
import { SERVING_TENANT_STATUSES } from "./types";

/** A tenant that may sign in and serve public pages (trial or active, not deleted). */
export function isServing(tenant: Pick<TenantRecord, "status" | "deletedAt"> | undefined | null): boolean {
  return Boolean(tenant && !tenant.deletedAt && SERVING_TENANT_STATUSES.includes(tenant.status));
}
