import type { MessageKey, TranslateParams } from "../i18n/translate";

/**
 * Error with an HTTP status and a translation key; the response layer translates it into
 * the request's language, so services never produce user-facing text themselves.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly messageKey: MessageKey,
    readonly params?: TranslateParams,
    readonly data?: Record<string, unknown>,
  ) {
    super(messageKey);
    this.name = "AppError";
  }
}

export type ValidationIssue = { path: string; messageKey: string; params?: TranslateParams };

export class ValidationError extends AppError {
  constructor(readonly issues: ValidationIssue[]) {
    super(422, "errors.validation");
    this.name = "ValidationError";
  }
}

export function validationError(path: string, messageKey: MessageKey, params?: TranslateParams): ValidationError {
  return new ValidationError([{ path, messageKey, params }]);
}

export const badRequest = (key: MessageKey = "errors.badRequest", params?: TranslateParams) =>
  new AppError(400, key, params);
export const unauthorized = (key: MessageKey = "errors.unauthorized") => new AppError(401, key);
export const forbidden = (key: MessageKey = "errors.forbidden") => new AppError(403, key);
export const notFound = (key: MessageKey = "errors.notFound") => new AppError(404, key);
export const conflict = (key: MessageKey, params?: TranslateParams, data?: Record<string, unknown>) =>
  new AppError(409, key, params, data);
export const tooManyRequests = () => new AppError(429, "errors.tooManyRequests");
