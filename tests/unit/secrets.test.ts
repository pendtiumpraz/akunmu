import { describe, expect, it } from "vitest";
import { looksLikeSecret, safeText } from "@/shared/secrets";

describe("secret detection", () => {
  it("spots keys, tokens, private keys and backup codes", () => {
    for (const text of [
      "sk-abcdefghijklmnopqrstuvwx",
      "ghp_abcdefghijklmnopqrstuvwxyz0123",
      "AKIAABCDEFGHIJKLMNOP",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature",
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "backup: 1234-5678 9012-3456 7890-1234",
    ]) {
      expect(looksLikeSecret(text), text).toBe(true);
    }
  });

  it("lets ordinary notes through", () => {
    for (const text of ["Work laptop on the third floor", "Phone +62 812 3456 7890", "Signed in on 2026-10-11 for the audit"]) {
      expect(looksLikeSecret(text), text).toBe(false);
    }
  });

  it("refuses secrets in free-text fields and turns blanks into null", () => {
    const notes = safeText(200);
    expect(notes.safeParse("ghp_abcdefghijklmnopqrstuvwxyz0123").success).toBe(false);
    expect(notes.parse("   ")).toBeNull();
    expect(notes.parse(" Office ")).toBe("Office");
  });
});
