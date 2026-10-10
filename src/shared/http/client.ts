"use client";

/** Browser client for the app's own API ({ data, message, errors }). */
export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string[]> = {},
    readonly data: unknown = null,
  ) {
    super(message);
    this.name = "ApiClientError";
  }

  /** First error for a field path such as "answers.role". */
  field(path: string): string | undefined {
    return this.fieldErrors[path]?.[0];
  }
}

export type ApiResult<T> = { data: T; message: string };

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const method = options.method ?? (options.body !== undefined || options.formData ? "POST" : "GET");
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: options.formData ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: options.formData ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      signal: options.signal,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiClientError("", 0);
  }
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; message?: string; errors?: Record<string, string[]> }
    | null;
  if (!response.ok) {
    throw new ApiClientError(payload?.message ?? "", response.status, payload?.errors ?? {}, payload?.data ?? null);
  }
  return { data: payload?.data as T, message: payload?.message ?? "" };
}

export type Paginated<T> = { items: T[]; meta: { page: number; perPage: number; total: number; totalPages: number } };

/** Shape of a server record after JSON serialization (Date → ISO string). */
export type Json<T> = T extends Date
  ? string
  : T extends Array<infer Item>
    ? Json<Item>[]
    : T extends object
      ? { [Key in keyof T]: Json<T[Key]> }
      : T;

/** Field errors keyed by path ("answers.role") with the first message only. */
export function firstFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiClientError)) return {};
  return Object.fromEntries(Object.entries(error.fieldErrors).map(([key, messages]) => [key, messages[0] ?? ""]));
}
