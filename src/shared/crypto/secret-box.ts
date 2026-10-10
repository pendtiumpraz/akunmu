import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { appSecret } from "../env";

/**
 * Authenticated encryption (AES-256-GCM) for secrets stored in the database,
 * such as AI provider keys. Format: "v1.<iv>.<tag>.<ciphertext>" (base64url parts).
 * The key is derived from APP_SECRET; rotating APP_SECRET makes old values unreadable.
 */
const VERSION = "v1";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(`secret-box:${secret}`).digest();
}

export function encryptSecret(plaintext: string, secret: string = appSecret()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Returns null when the value is malformed or was encrypted with another secret. */
export function decryptSecret(sealed: string, secret: string = appSecret()): string | null {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
