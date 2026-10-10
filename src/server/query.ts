import { readPagination, type Pagination } from "@/shared/http/request";

/** Helpers for list endpoints: ?page, ?per_page, ?search and typed filters. */
export function listParams(url: URL): Pagination & { search?: string } {
  const search = url.searchParams.get("search")?.trim();
  return { ...readPagination(url.searchParams), search: search ? search.slice(0, 100) : undefined };
}

export function enumParam<T extends string>(url: URL, name: string, values: readonly T[]): T | undefined {
  const value = url.searchParams.get(name);
  return value && (values as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function idParam(url: URL, name: string): number | undefined {
  const value = url.searchParams.get(name);
  if (!value || !/^\d{1,15}$/.test(value)) return undefined;
  const id = Number(value);
  return id > 0 ? id : undefined;
}

export function boolParam(url: URL, name: string): boolean | undefined {
  const value = url.searchParams.get(name);
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return undefined;
}
