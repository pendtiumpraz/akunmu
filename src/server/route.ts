import { headers } from "next/headers";
import type { IngestTokenRecord } from "@/modules/connect/schema";
import { authenticateIngest } from "@/modules/connect/service";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { asPlatform, inTenant } from "@/shared/db";
import { getI18n } from "@/shared/i18n/server";
import type { I18n } from "@/shared/i18n/messages-loader";
import { forbidden } from "@/shared/http/errors";
import { assertSameOrigin } from "@/shared/http/request";
import { errorResponse } from "@/shared/http/respond";
import type { Permission } from "@/modules/users/permissions";
import { requireStaff, type StaffContext } from "@/modules/users/session";

/**
 * Route handler wrappers: translate errors into the { data, message } envelope in the request's language,
 * enforce the same-origin check on mutations (CSRF), resolve the staff session, and run the handler in the
 * right data scope (row level security): the staff member's workspace or the platform. Public handlers
 * choose their workspace themselves (see `publicRoute`).
 */
type RouteParams = Record<string, string>;

type BaseContext<P extends RouteParams> = {
  request: Request;
  params: P;
  url: URL;
  i18n: I18n;
};

type NextRouteContext<P extends RouteParams> = { params: Promise<P> };

/** Runs the handler inside a data scope (or as is, for public handlers that pick a tenant themselves). */
type Scoper = <T>(operation: () => Promise<T>) => Promise<T>;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const unscoped: Scoper = (operation) => operation();

function wrap<P extends RouteParams, Extra>(
  options: { csrf: boolean },
  resolve: () => Promise<{ extra: Extra; scope: Scoper }>,
  handler: (context: BaseContext<P> & Extra) => Promise<Response>,
) {
  return async (request: Request, routeContext: NextRouteContext<P>): Promise<Response> => {
    const i18n = await getI18n();
    try {
      if (options.csrf && !SAFE_METHODS.has(request.method)) assertSameOrigin(request);
      const { extra, scope } = await resolve();
      const params = await routeContext.params;
      return await scope(() => handler({ request, params, url: new URL(request.url), i18n, ...extra }));
    } catch (error) {
      return errorResponse(error, i18n.t);
    }
  };
}

/**
 * Public endpoint (sign-up, sign-in). The handler starts outside any workspace and enters one with
 * inTenant() once it knows which. Mutations still require a same-origin request.
 */
export function publicRoute<P extends RouteParams = RouteParams>(
  handler: (context: BaseContext<P>) => Promise<Response>,
  options: { csrf?: boolean } = {},
) {
  return wrap<P, object>({ csrf: options.csrf ?? true }, async () => ({ extra: {}, scope: unscoped }), handler);
}

/** Tenant staff endpoint; pass a permission to restrict by role. Runs in the staff member's tenant. */
export function staffRoute<P extends RouteParams = RouteParams>(
  permission: Permission | null,
  handler: (context: BaseContext<P> & { staff: StaffContext & { tenantId: number } }) => Promise<Response>,
) {
  return wrap<P, { staff: StaffContext & { tenantId: number } }>(
    { csrf: true },
    async () => {
      const staff = await requireStaff(permission ?? undefined);
      // Platform staff manage tenants from the platform console, not through tenant endpoints.
      if (staff.tenantId === null) throw forbidden();
      const tenantId = staff.tenantId;
      return { extra: { staff: { ...staff, tenantId } }, scope: (operation) => inTenant(tenantId, operation) };
    },
    handler,
  );
}

/** Platform console endpoint (AkunMu owner and support staff); sees every tenant. */
export function platformRoute<P extends RouteParams = RouteParams>(handler: (context: BaseContext<P> & { staff: StaffContext }) => Promise<Response>) {
  return wrap<P, { staff: StaffContext }>(
    { csrf: true },
    async () => {
      const staff = await requireStaff();
      if (staff.tenantId !== null) throw forbidden();
      return { extra: { staff }, scope: asPlatform };
    },
    handler,
  );
}

/** Reports an agent may send per key per hour (the extension reports a few times a day, per profile). */
const INGEST_REQUESTS_PER_HOUR = 120;

/**
 * Agent endpoint (the browser extension): no session and no same-origin check, a workspace key in the
 * Authorization header instead; runs in the key's workspace.
 */
export function ingestRoute<P extends RouteParams = RouteParams>(handler: (context: BaseContext<P> & { token: IngestTokenRecord }) => Promise<Response>) {
  return wrap<P, { token: IngestTokenRecord }>(
    { csrf: false },
    async () => {
      const token = await authenticateIngest((await headers()).get("authorization"));
      await enforceRateLimit(`ingest:${token.id}`, INGEST_REQUESTS_PER_HOUR, 3600);
      return { extra: { token }, scope: (operation) => inTenant(token.tenantId, operation) };
    },
    handler,
  );
}
