import { z } from "zod";
import { blankToNull } from "./text";

/*
 * AkunMu records where accounts are signed in, never how to sign in. Free text (notes, labels) is checked
 * for things that look like secrets so they are not stored by accident.
 */

const SECRET_PATTERNS = [
  // API keys and tokens with well-known prefixes.
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/,
  /\b(?:ghp|gho|ghu|ghs|github_pat|glpat|xox[abpr])[_-][A-Za-z0-9_-]{16,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  // JSON Web Tokens and private keys.
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  // Backup or recovery codes: several groups of digits in a row ("1234-5678 9012-3456").
  /\b(?:\d{4,5}[- ]){3,}\d{4,5}\b/,
];

export function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

/** Optional free text without secrets; blank becomes null. */
export function safeText(max: number) {
  return z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .max(max)
      .refine((value) => !looksLikeSecret(value), { error: "validation.noSecrets" })
      .nullish(),
  );
}
