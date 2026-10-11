// Packs the browser extension into public/downloads/akunmu-extension.zip, served by the app ("Download & connect").
// Runs before every build (npm "prebuild", desktop/scripts/build.mjs). No packages: a plain deflate zip with fixed
// timestamps, so the same source always gives the same file. Usage: node extension/scripts/pack.mjs
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

const extension = path.resolve(import.meta.dirname, "..");
const root = path.resolve(extension, "..");
const output = path.join(root, "public", "downloads", "akunmu-extension.zip");
// Inside the zip everything sits in one folder, the one the owner loads with "Load unpacked".
const FOLDER = "akunmu-extension";
const SKIPPED = new Set(["scripts"]);

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function filesIn(directory, prefix = "") {
  return readdirSync(directory)
    .sort()
    .flatMap((entry) => {
      if (!prefix && SKIPPED.has(entry)) return [];
      const full = path.join(directory, entry);
      const name = prefix ? `${prefix}/${entry}` : entry;
      return statSync(full).isDirectory() ? filesIn(full, name) : [{ full, name }];
    });
}

// 1 January 2026, 00:00, in MS-DOS form.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const locals = [];
const centrals = [];
let offset = 0;
for (const { full, name } of filesIn(extension)) {
  const data = readFileSync(full);
  const packed = deflateRawSync(data, { level: 9 });
  const fileName = Buffer.from(`${FOLDER}/${name}`, "utf8");
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, fileName, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, fileName);

  offset += local.length + fileName.length + packed.length;
}

const directory = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
const count = centrals.length / 2;
end.writeUInt16LE(count, 8);
end.writeUInt16LE(count, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, Buffer.concat([...locals, directory, end]));
console.log(`extension packed: ${count} files → ${path.relative(root, output)}`);
