import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

/** The system's protection for this user: Electron's safeStorage (DPAPI on Windows, the keyring on Linux). */
export type Protection = {
  available: () => boolean;
  encrypt: (plain: string) => Buffer;
  decrypt: (sealed: Buffer) => string;
};

export type LoadedSecret = {
  value: string;
  /** Where a stored key that could not be read was moved before a new one was made, or null. */
  replaced: string | null;
};

/** The server refuses a shorter APP_SECRET (src/shared/env.ts). */
const MIN_LENGTH = 32;

/**
 * The key the app encrypts the secrets it stores with (the AI keys), kept in secret.json: made on the first launch and
 * encrypted for this user when the system can. A stored key that cannot be read any more (the data folder came from
 * another computer or Windows user, or the file is damaged) is moved aside and replaced, so the app still starts:
 * the trees are untouched, only the AI keys need entering again.
 */
export function loadAppSecret(file: string, protection: Protection, now: Date = new Date()): LoadedSecret {
  if (!existsSync(file)) return { value: createSecret(file, protection), replaced: null };
  const value = readSecret(file, protection);
  if (value !== null) return { value, replaced: null };
  // Kept, not deleted: back on the computer and account that made it, it can still be restored by hand.
  const replaced = `${file}.unreadable-${now.toISOString().replace(/[:.]/g, "-")}`;
  renameSync(file, replaced);
  return { value: createSecret(file, protection), replaced };
}

function readSecret(file: string, protection: Protection): string | null {
  try {
    const stored = JSON.parse(readFileSync(file, "utf8")) as { protected?: unknown; value?: unknown };
    if (typeof stored.value !== "string") return null;
    const value = stored.protected ? protection.decrypt(Buffer.from(stored.value, "base64")) : stored.value;
    return value.length >= MIN_LENGTH ? value : null;
  } catch {
    return null;
  }
}

function createSecret(file: string, protection: Protection): string {
  const secret = randomBytes(48).toString("base64url");
  const canProtect = protection.available();
  const value = canProtect ? protection.encrypt(secret).toString("base64") : secret;
  writeFileSync(file, JSON.stringify({ protected: canProtect, value }), { mode: 0o600 });
  return secret;
}
