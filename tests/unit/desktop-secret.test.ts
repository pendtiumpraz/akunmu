import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadAppSecret, type Protection } from "../../desktop/src/secret";

// Stands in for safeStorage: a reversible scramble, so a protected file never holds the key as written.
const scramble = (data: Buffer) => Buffer.from(data.map((byte) => byte ^ 0x5a));
const protection = (overrides: Partial<Protection> = {}): Protection => ({
  available: () => true,
  encrypt: (plain) => scramble(Buffer.from(plain, "utf8")),
  decrypt: (sealed) => scramble(sealed).toString("utf8"),
  ...overrides,
});
// What safeStorage does with a value protected for another Windows user or computer.
const elsewhere = protection({
  decrypt: () => {
    throw new Error("Error while decrypting the ciphertext provided to safeStorage.decryptString.");
  },
});

describe("desktop app secret", () => {
  let folder: string;
  let file: string;

  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), "akunmu-secret-"));
    file = path.join(folder, "secret.json");
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it("makes a protected key on the first launch and reads the same key afterwards", () => {
    const first = loadAppSecret(file, protection());
    expect(first.replaced).toBeNull();
    expect(first.value.length).toBeGreaterThanOrEqual(32);
    const stored = JSON.parse(readFileSync(file, "utf8")) as { protected: boolean; value: string };
    expect(stored.protected).toBe(true);
    expect(stored.value).not.toContain(first.value);
    expect(loadAppSecret(file, protection())).toEqual({ value: first.value, replaced: null });
  });

  it("keeps the key as it is where the system cannot protect it", () => {
    const first = loadAppSecret(file, protection({ available: () => false }));
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ protected: false, value: first.value });
    expect(loadAppSecret(file, protection({ available: () => false })).value).toBe(first.value);
  });

  it("replaces a key protected on another computer or for another user, keeping the old file", () => {
    const original = loadAppSecret(file, protection()).value;
    const before = readFileSync(file, "utf8");

    const moved = loadAppSecret(file, elsewhere, new Date("2026-10-13T06:00:00.000Z"));
    expect(moved.value).not.toBe(original);
    expect(moved.value.length).toBeGreaterThanOrEqual(32);
    expect(moved.replaced).toBe(`${file}.unreadable-2026-10-13T06-00-00-000Z`);
    expect(readFileSync(moved.replaced as string, "utf8")).toBe(before);

    // The new key is the one read from now on.
    expect(loadAppSecret(file, protection())).toEqual({ value: moved.value, replaced: null });
  });

  it("replaces a damaged file or a key the server would refuse", () => {
    writeFileSync(file, "{ not json");
    const damaged = loadAppSecret(file, protection());
    expect(damaged.replaced).not.toBeNull();
    expect(existsSync(damaged.replaced as string)).toBe(true);

    writeFileSync(file, JSON.stringify({ protected: false, value: "too-short" }));
    const short = loadAppSecret(file, protection(), new Date("2026-10-13T07:00:00.000Z"));
    expect(short.replaced).toBe(`${file}.unreadable-2026-10-13T07-00-00-000Z`);
    expect(short.value.length).toBeGreaterThanOrEqual(32);

    writeFileSync(file, JSON.stringify({ protected: true }));
    expect(loadAppSecret(file, protection(), new Date("2026-10-13T08:00:00.000Z")).replaced).not.toBeNull();
  });
});
