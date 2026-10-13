import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectImageType, readStored, removeStored, storage } from "@/shared/storage";

let uploads: string;

beforeEach(() => {
  uploads = mkdtempSync(path.join(tmpdir(), "akunmu-storage-"));
  process.env.AKUNMU_UPLOADS_DIR = uploads;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL;
});

afterEach(() => {
  delete process.env.AKUNMU_UPLOADS_DIR;
  delete process.env.VERCEL;
  rmSync(uploads, { recursive: true, force: true });
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);

describe("file storage", () => {
  it("tells images by their signature, not by what they claim to be", () => {
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 0]))).toBe("image/jpeg");
    expect(detectImageType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(4)]))).toBe("image/webp");
    expect(detectImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
  });

  it("keeps local files inside the uploads folder and removes them", async () => {
    const stored = await storage().put("projects/1/shot.png", PNG, "image/png");
    expect(stored.url).toMatch(/^local:projects\/1\/shot-[a-z0-9]+\.png$/);
    expect(await readStored(stored)).toEqual(PNG);
    await expect(readStored({ url: "local:../outside.png", path: "../outside.png" })).rejects.toThrow();
    await removeStored(stored);
    expect(await readStored(stored)).toBeNull();
  });

  it("refuses to keep files on Vercel without Blob, where they would be lost", () => {
    process.env.VERCEL = "1";
    expect(() => storage()).toThrow(expect.objectContaining({ status: 503, messageKey: "errors.storageUnavailable" }));
  });
});
