import { badRequest, forbidden, notFound } from "./errors";

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest("errors.invalidJson");
  }
}

/**
 * A path on this site to continue to after signing in ("/e/x/recap"). Anything that could leave the site
 * ("//other.host", "https://…", "/\\host") or break a header is refused (null).
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || /[\r\n\t]/.test(value)) return null;
  return value;
}

/** Parses a numeric route id; anything else is treated as "not found". */
export function parseId(raw: string | undefined): number {
  if (!raw || !/^\d{1,15}$/.test(raw)) throw notFound();
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw notFound();
  return value;
}

export type Pagination = { page: number; perPage: number };

export function readPagination(params: URLSearchParams, defaultPerPage = 20, maxPerPage = 100): Pagination {
  const page = Math.max(1, Math.floor(Number(params.get("page") ?? "1")) || 1);
  const perPage = Math.min(maxPerPage, Math.max(1, Math.floor(Number(params.get("per_page") ?? defaultPerPage)) || defaultPerPage));
  return { page, perPage };
}

export type Paginated<T> = { items: T[]; meta: { page: number; perPage: number; total: number; totalPages: number } };

export function paginated<T>(items: T[], total: number, pagination: Pagination): Paginated<T> {
  return {
    items,
    meta: {
      page: pagination.page,
      perPage: pagination.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.perPage)),
    },
  };
}

function requestHost(request: Request): string {
  return request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
}

/**
 * CSRF guard for cookie-authenticated mutations: the Origin header (when sent) must match this host,
 * and browsers that report a cross-site fetch are rejected.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw forbidden("errors.crossSite");
    }
    if (originHost !== requestHost(request)) throw forbidden("errors.crossSite");
    return;
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") throw forbidden("errors.crossSite");
}

/** Public origin of the current request (respects proxies such as Vercel). */
export function requestOrigin(request: Request): string {
  const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return `${protocol}://${requestHost(request)}`;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
