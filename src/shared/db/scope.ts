import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Data scope: whose rows the current code may touch.
 *
 * Every database statement runs in a short transaction that first switches to the role akunmu_app (which
 * cannot bypass row level security) and sets app.tenant_id / app.platform; the RLS policies of migration
 * 0001 read those settings. Being transaction-local, the settings never leak through Neon's pooler.
 *
 * - inTenant(id, fn): only that workspace's rows (requests of workspace staff).
 * - asPlatform(fn):   every workspace (owner console, sign-in lookups by email or token, scripts, slug checks).
 * - neither:          no workspace rows at all.
 */
export type DataScope = { tenantId: number | null; platform: boolean };

export const APP_DATABASE_ROLE = "akunmu_app";

/** First statement of every scoped transaction; parameters come from scopeParameters(). */
export const SCOPE_STATEMENT =
  "select set_config('role', $1, true), set_config('app.tenant_id', $2, true), set_config('app.platform', $3, true)";

const NO_SCOPE: DataScope = { tenantId: null, platform: false };

// Kept on globalThis so every route bundle shares one store (module copies would not see each other's scope).
type ScopeGlobals = { storage: AsyncLocalStorage<DataScope>; fallback: DataScope };
const holder = globalThis as typeof globalThis & { __akunmuScope?: ScopeGlobals };
const globals: ScopeGlobals = (holder.__akunmuScope ??= { storage: new AsyncLocalStorage<DataScope>(), fallback: NO_SCOPE });

export function currentScope(): DataScope {
  return globals.storage.getStore() ?? globals.fallback;
}

export function currentTenantId(): number | null {
  return currentScope().tenantId;
}

export function requireTenantId(): number {
  const tenantId = currentTenantId();
  if (tenantId === null) throw new Error("This operation needs a tenant scope.");
  return tenantId;
}

export function isPlatformScope(): boolean {
  return currentScope().platform;
}

/** Runs `operation` with database access limited to one tenant's rows. */
export function inTenant<T>(tenantId: number, operation: () => Promise<T>): Promise<T> {
  return globals.storage.run({ tenantId, platform: false }, operation);
}

/** Runs `operation` with access to every tenant. Keep these blocks small and purposeful. */
export function asPlatform<T>(operation: () => Promise<T>): Promise<T> {
  return globals.storage.run({ tenantId: null, platform: true }, operation);
}

/** Scope used when no request scope is active. Only tests and command-line scripts set it. */
export function setFallbackScope(scope: DataScope | null): void {
  globals.fallback = scope ?? NO_SCOPE;
}

/** Parameters for SCOPE_STATEMENT, captured synchronously when a statement is issued. */
export function scopeParameters(scope: DataScope = currentScope()): string[] {
  return [APP_DATABASE_ROLE, scope.tenantId === null ? "" : String(scope.tenantId), scope.platform ? "on" : "off"];
}
