/** Lifecycle of a tenant (a workspace on AkunMu). */
export const TENANT_STATUSES = ["trial", "active", "suspended", "cancelled"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** Tenants that may sign in and serve public pages. */
export const SERVING_TENANT_STATUSES: readonly TenantStatus[] = ["trial", "active"];
