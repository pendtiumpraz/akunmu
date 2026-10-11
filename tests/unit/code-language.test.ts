import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner rule (loop-v5 rule #12): code is English only. Indonesian may appear only in language files.
 * This guard scans source, scripts and tests for common Indonesian words in identifiers, comments and
 * strings (camelCase is split into words).
 */
const INDONESIAN_WORDS = [
  "yang", "dengan", "untuk", "tidak", "belum", "sudah", "adalah", "dari", "pada", "akan", "bisa", "harus",
  "acara", "peserta", "pendaftaran", "daftar", "absensi", "hadir", "tiket", "wajib", "persetujuan", "wali",
  "anak", "dewasa", "disabilitas", "kunci", "simpan", "hapus", "ubah", "buat", "kirim", "terima", "gagal",
  "berhasil", "pengguna", "sandi", "masuk", "keluar", "halaman", "tombol", "nama", "tanggal", "waktu",
  "lokasi", "cetak", "pindai", "titik", "bundel", "aplikasi", "pemohon", "pelindungan", "pribadi", "jalur",
  "kanal", "sumber", "butir", "pilihan", "galat", "muat", "skrip", "profil", "tanda", "catat", "ajukan",
];

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const SCANNED = ["src", "scripts", "tests", "extension", path.join("desktop", "src"), path.join("desktop", "scripts")];
const ALLOWED = new Set([path.join("tests", "unit", "code-language.test.ts")]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|mjs|cjs|css|html)$/.test(entry) ? [full] : [];
  });
}

function words(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

describe("code language", () => {
  it("contains no Indonesian outside language files", () => {
    const vocabulary = new Set(INDONESIAN_WORDS);
    const findings: string[] = [];
    for (const folder of SCANNED) {
      for (const file of sourceFiles(path.join(ROOT, folder))) {
        const relative = path.relative(ROOT, file);
        if (ALLOWED.has(relative)) continue;
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, index) => {
            const hits = words(line).filter((word) => vocabulary.has(word));
            if (hits.length > 0) findings.push(`${relative}:${index + 1} → ${[...new Set(hits)].join(", ")}`);
          });
      }
    }
    expect(findings).toEqual([]);
  });
});
