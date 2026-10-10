import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** Crockford base32 without ambiguous characters (no I, L, O, U); easy to read aloud and type. */
export const READABLE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function randomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

/** Random string from an alphabet using unbiased crypto.randomInt. */
export function randomString(length: number, alphabet: string = READABLE_ALPHABET): string {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += alphabet[randomInt(alphabet.length)];
  }
  return result;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacBase64Url(key: string, data: string): string {
  return createHmac("sha256", key).update(data).digest("base64url");
}

export function hmacHex(key: string, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

/** Constant-time string comparison; unequal lengths are rejected without leaking timing on content. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
