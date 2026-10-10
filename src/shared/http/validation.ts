import type { z } from "zod";
import type { TranslateParams } from "../i18n/translate";
import { ValidationError, type ValidationIssue } from "./errors";

type ZodIssue = z.ZodError["issues"][number];

function numeric(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value);
}

/** Maps a Zod issue to a translation key; custom messages that are already keys ("validation.*") are kept. */
function messageForIssue(issue: ZodIssue): { messageKey: string; params?: TranslateParams } {
  if (typeof issue.message === "string" && issue.message.startsWith("validation.")) {
    const params: TranslateParams = {};
    if ("minimum" in issue) params.min = numeric(issue.minimum);
    if ("maximum" in issue) params.max = numeric(issue.maximum);
    return { messageKey: issue.message, params };
  }
  switch (issue.code) {
    case "invalid_type":
      return { messageKey: issue.input === undefined || issue.input === null ? "validation.required" : "validation.invalid" };
    case "too_small": {
      const min = numeric(issue.minimum);
      if (issue.origin === "string") return min <= 1 ? { messageKey: "validation.required" } : { messageKey: "validation.minLength", params: { min } };
      if (issue.origin === "array") return { messageKey: "validation.minItems", params: { min } };
      return { messageKey: "validation.minValue", params: { min } };
    }
    case "too_big": {
      const max = numeric(issue.maximum);
      if (issue.origin === "string") return { messageKey: "validation.maxLength", params: { max } };
      if (issue.origin === "array") return { messageKey: "validation.maxItems", params: { max } };
      return { messageKey: "validation.maxValue", params: { max } };
    }
    case "invalid_format":
      if (issue.format === "email") return { messageKey: "validation.email" };
      if (issue.format === "url") return { messageKey: "validation.url" };
      return { messageKey: "validation.invalid" };
    case "invalid_value":
      return { messageKey: "validation.choice" };
    default:
      return { messageKey: "validation.invalid" };
  }
}

export function issuesFromZod(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.map(String).join("."), ...messageForIssue(issue) }));
}

/** Parses input with a schema or throws a ValidationError (HTTP 422) with translatable messages. */
export function parseWith<Output>(schema: z.ZodType<Output>, input: unknown): Output {
  const result = schema.safeParse(input, { reportInput: true });
  if (!result.success) throw new ValidationError(issuesFromZod(result.error));
  return result.data;
}
