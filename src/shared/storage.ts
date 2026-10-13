import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";
import { blobToken, onVercel, uploadsDir } from "./env";
import { AppError } from "./http/errors";

/**
 * File storage behind one interface: Vercel Blob when its token is set (the web app), else a local folder (AkunMu
 * Desktop's data folder, or public/uploads in development). Callers keep the returned `path` to remove the file later,
 * and serve files through their own route, which redirects to a Blob URL or reads the local file.
 */
export type StoredFile = { url: string; path: string };

export interface StorageDriver {
  put(objectPath: string, data: Buffer, contentType: string): Promise<StoredFile>;
  remove(stored: StoredFile): Promise<void>;
  /** The bytes of a locally stored file; null when it is missing (Blob files are fetched by the browser itself). */
  read(stored: StoredFile): Promise<Buffer | null>;
}

const blobDriver = (token: string): StorageDriver => ({
  async put(objectPath, data, contentType) {
    const result = await put(objectPath, data, { access: "public", contentType, addRandomSuffix: true, token });
    return { url: result.url, path: result.pathname };
  },
  async remove(stored) {
    await del(stored.url, { token });
  },
  async read() {
    return null;
  },
});

function localRoot(): string {
  return uploadsDir() ?? path.join(process.cwd(), "public", "uploads");
}

/**
 * A stored path inside the uploads folder, never outside it. The folder is only known at run time (the desktop's data
 * folder), so the bundler is told not to trace it: the files are data, not part of the build.
 */
function localTarget(relative: string): string {
  const root = path.resolve(/*turbopackIgnore: true*/ localRoot());
  const target = path.resolve(/*turbopackIgnore: true*/ root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("Path outside the uploads folder.");
  return target;
}

const localDriver: StorageDriver = {
  async put(objectPath, data) {
    const safe = objectPath.replace(/[^a-zA-Z0-9/._-]/g, "-").replace(/\.\.+/g, ".");
    const unique = safe.replace(/(\.[a-z0-9]+)?$/i, (extension) => `-${Date.now().toString(36)}${extension}`);
    const target = localTarget(unique);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    return { url: `local:${unique}`, path: unique };
  },
  async remove(stored) {
    await unlink(localTarget(stored.path)).catch(() => undefined);
  },
  async read(stored) {
    return readFile(/*turbopackIgnore: true*/ localTarget(stored.path)).catch(() => null);
  },
};

export function storage(): StorageDriver {
  const token = blobToken();
  if (token) return blobDriver(token);
  // On Vercel a local file would be lost (or refused): without Blob there is nowhere to keep it.
  if (onVercel()) throw new AppError(503, "errors.storageUnavailable");
  return localDriver;
}

const isBlobUrl = (url: string) => /^https?:\/\//.test(url);

/** Removes a stored file with the driver that stored it (a Blob file needs the Blob token; without it, it stays). */
export async function removeStored(stored: StoredFile): Promise<void> {
  if (!isBlobUrl(stored.url)) return localDriver.remove(stored);
  const token = blobToken();
  if (token) await blobDriver(token).remove(stored);
}

/** The bytes of a locally stored file (null for a Blob file, which the browser loads from its own URL). */
export async function readStored(stored: StoredFile): Promise<Buffer | null> {
  return isBlobUrl(stored.url) ? null : localDriver.read(stored);
}

export const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type ImageType = keyof typeof IMAGE_TYPES;

/** The image type by the file's signature, not its declared type; null for anything else. */
export function detectImageType(data: Buffer): ImageType | null {
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length > 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}
