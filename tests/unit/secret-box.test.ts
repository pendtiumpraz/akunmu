import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/shared/crypto/secret-box";

describe("secret box", () => {
  it("encrypts and decrypts with the app secret", () => {
    const sealed = encryptSecret("sk_live_value");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("sk_live_value");
    expect(decryptSecret(sealed)).toBe("sk_live_value");
  });

  it("returns null for another secret or tampered data", () => {
    const sealed = encryptSecret("value", "first-secret-0123456789-0123456789");
    expect(decryptSecret(sealed, "second-secret-0123456789-012345678")).toBeNull();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(decryptSecret(parts.join("."), "first-secret-0123456789-0123456789")).toBeNull();
    expect(decryptSecret("garbage")).toBeNull();
  });
});
