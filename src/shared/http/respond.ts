import type { Translator } from "../i18n/translate";
import { AppError, ValidationError } from "./errors";

/** Standard API envelope (loop-v5): { data, message } plus `errors` for validation failures. */
export type ApiEnvelope<T> = { data: T; message: string; errors?: Record<string, string[]> };

export function ok<T>(data: T, message = "", status = 200, headers?: HeadersInit): Response {
  return Response.json({ data, message } satisfies ApiEnvelope<T>, { status, headers });
}

export function created<T>(data: T, message = ""): Response {
  return ok(data, message, 201);
}

export function errorResponse(error: unknown, t: Translator): Response {
  if (error instanceof ValidationError) {
    const errors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path || "_";
      (errors[key] ??= []).push(t.dynamic(issue.messageKey, issue.params));
    }
    return Response.json({ data: null, message: t("errors.validation"), errors } satisfies ApiEnvelope<null>, {
      status: 422,
    });
  }
  if (error instanceof AppError) {
    return Response.json(
      { data: error.data ?? null, message: t.dynamic(error.messageKey, error.params) },
      { status: error.status },
    );
  }
  console.error("[api] unexpected error", error);
  return Response.json({ data: null, message: t("errors.server") }, { status: 500 });
}
