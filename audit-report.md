# Laporan Audit — AkunMu

**Tanggal:** 2026-10-11
**Auditor:** Sainskerta Loop Workflow (Claude Code, self-review)
**Lingkup:** commit `1db0214` (backend + UI), `12b7b2f` (perbaikan QA) + tes unit tambahan di commit audit

## Ringkasan

| Area | Hasil | Catatan |
|---|---|---|
| Security | ✅ lulus (2 catatan rendah) | lihat Issue #1, #2 |
| Performance | ✅ lulus | query terindeks, paginasi daftar akun; peta dimuat sekali per layar (#3) |
| Code Quality | ✅ lulus | `tsc` 0 galat, `eslint` 0 masalah, 62 tes lulus, `next build` sukses |
| Bahasa kode & i18n | ✅ lulus | scan kata Indonesia lulus, paritas id/en lulus, uji tambah bahasa lulus |
| UI/UX | ✅ lulus | 35 tangkapan layar (terang, gelap, HP) diperiksa; perbaikan sudah di-commit |
| Mobile | ⚠️ peringatan | 390 px dan 1440 px diperiksa; tablet (768–1023 px) belum difoto khusus (#4) |
| Database | ✅ lulus | 15 tabel, 0 FK, RLS ENABLE + FORCE di semua tabel ruang kerja, soft delete + pulihkan |

## Bukti verifikasi

- **Tes otomatis:** 62/62 lulus (Vitest, PostgreSQL in-memory PGlite dengan RLS aktif). Cakupan:
  - peta login: akun baru dibuat saat login pertama dan dipakai ulang (huruf besar/kecil diabaikan); satu login aktif per akun + tempat; logout menyimpan riwayat; profil perangkat lain ditolak; nama aplikasi + profil ditolak;
  - "perlu dicek": login > 30 hari dan yang ditandai; konfirmasi per login dan per perangkat; login yang sudah berakhir tidak bisa dikonfirmasi; akun dengan tempat terbanyak;
  - hapus berantai + pulihkan: perangkat (profil + login ikut), akun (login ikut, ditolak bila identitasnya sudah dipakai akun baru), profil (login ikut), penyedia (hanya yang tanpa akun);
  - isolasi ruang kerja: data tidak terlihat lewat service maupun SQL mentah, baris untuk ruang kerja lain ditolak, akun yang sama boleh ada di dua ruang kerja, semua tabel ber-`tenant_id` punya RLS paksa;
  - platform: daftar mandiri (alamat otomatis, akhiran `-2` bila dipakai), penyedia bawaan, ruang kerja ditangguhkan/dihapus/dipulihkan;
  - asisten AI: jawaban dengan alat baca, usulan perubahan hanya jalan setelah dikonfirmasi, login yang sudah ada dilewati, penyedia tak dikenal dilaporkan, alat sesuai peran, tidak bisa menjangkau ruang kerja lain, kata sandi di chat disamarkan, usulan terbuka dibatalkan saat bertanya hal lain, thinking Claude diputar ulang hanya di loop berjalan;
  - deteksi rahasia (kunci API, token, JWT, kunci privat, kode cadangan) dan enkripsi kunci;
  - file bahasa (paritas, placeholder, isi kosong, registry), zona waktu, aturan bahasa kode.
- **Build:** `next build` (Turbopack) sukses; 65 route (49 API + 16 halaman).
- **Uji di browser:** server produksi (`next start`) di atas PostgreSQL in-memory lewat protokol wire (tanpa menyentuh Neon), data contoh realistis (4 perangkat, 7 profil, 19 login aktif) dan penyedia AI tiruan. Diperiksa: landing (terang/gelap/HP), masuk, daftar, peta login empat kolom, daftar perlu dicek, palet ⌘K, drawer catat login, perangkat + detail, akun + detail, penyedia, asisten (jawaban dengan kartu, perintah `/`, sebut `@perangkat`, kartu konfirmasi), pengaturan AI + pengguna, konsol platform. Setelah perbaikan: **0 galat browser, 0 scroll horizontal.**
- **Tambah bahasa (dicoba):** `ms.json` parsial + 1 entri registry → `tsc` dan tes bahasa lulus, kunci yang hilang jatuh ke English. Perubahan dikembalikan.

## Checklist

### Security
- [x] XSS: React auto-escape. `dangerouslySetInnerHTML` hanya untuk skrip tema (konstanta di kode, tanpa input pengguna). Balasan asisten dirender oleh Markdown aman (teks React, tanpa HTML, tanpa gambar).
- [x] SQL injection: Drizzle query builder dengan parameter binding; input `LIKE` di-escape.
- [x] CSRF: semua mutasi ber-cookie wajib `Origin` sama; `Sec-Fetch-Site: cross-site` ditolak. Cookie `httpOnly`, `SameSite=Lax`, `Secure` di produksi.
- [x] Auth: bcrypt; rate limit masuk 10/15 menit per email dan 30 per IP; daftar 5/jam per IP; sesi 7 hari, bisa dicabut, dicabut saat ruang kerja ditangguhkan.
- [x] Otorisasi: setiap endpoint mutasi memakai izin peran (`map.write`, `users.manage`, `settings.manage`); alat asisten disaring dengan izin yang sama.
- [x] Tanpa rahasia: tidak ada kolom kata sandi/token/kode akun; catatan dan label yang tampak seperti rahasia ditolak (`validation.noSecrets`); kata sandi yang terketik di chat disamarkan sebelum dikirim ke penyedia AI.
- [x] Kunci API AI terenkripsi AES-256-GCM (`APP_SECRET`), tidak pernah dikirim ke browser.
- [x] Header keamanan: CSP `self` saja (tanpa domain pihak lain), `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS, kamera/mikrofon/lokasi dimatikan.

### Performance
- [x] Daftar akun berpaginasi (20/halaman, maks 100) dengan pencarian terindeks (`lower(identifier)`).
- [x] Indeks: `sign_ins(account_id)`, `(device_id)`, `(profile_id)`, indeks unik login aktif per tempat, `devices(tenant_id, name)`, `accounts(provider_id, lower(identifier))`.
- [x] Pool koneksi 1 per fungsi serverless (pooler Neon); `DATABASE_POOL_MAX` bisa diatur.
- [x] Langkah asisten dibatasi (6 per jalan, 12 per pertanyaan, 40 detik) agar muat satu permintaan serverless.

### Code Quality
- [x] Modular monolith: `modules/<domain>/{schema,types,validation,repository,service}`; route tipis.
- [x] Tanpa data dummy di frontend: semua layar memuat dari API (ilustrasi landing hanya contoh label dari file bahasa).
- [x] CRUD satu halaman + drawer kanan 400 px (aturan #4, #5); rail ikon satu warna per menu (aturan #6).

### Bahasa kode & i18n (aturan #12)
- [x] Kode 100% Inggris (dijaga tes `code-language`).
- [x] Semua teks UI, galat API, dan pesan validasi lewat `messages/id.json` + `messages/en.json` (paritas dijaga tes); pemilih bahasa di bilah atas, menu akun (HP), halaman masuk, dan kaki landing.

### Database
- [x] 15 tabel snake_case Inggris, PK bigint identity, `created_at`/`updated_at`/`deleted_at`, 0 foreign key.
- [x] Migrasi `0000_init` + `0001_rls` (peran `akunmu_app` NOBYPASSRLS, kebijakan per tabel, `staff_sessions` khusus platform).

## Issues

| # | Severity | Temuan | Status |
|---|---|---|---|
| 1 | Low | Email/username akun dikirim ke penyedia AI saat pertanyaan membutuhkannya (inti fitur "akun X login di mana"). Dicatat di catatan privasi pengaturan AI dan di `architecture-decisions.md`. | Diterima (by design) |
| 2 | Low | CSP masih `script-src 'unsafe-inline'` (skrip inline Next.js + skrip tema anti-kedip). | Diterima; nonce bisa ditambah nanti |
| 3 | Low | `/api/map` memuat semua perangkat, profil, dan login aktif sekaligus. Cocok untuk skala pribadi/tim kecil; untuk ribuan login perlu paginasi per perangkat. | Dicatat untuk Fase 07 |
| 4 | Low | Tampilan tablet (768–1023 px: peta satu kolom + rail) belum difoto khusus. | Dicatat |
| 5 | Info | Belum ada email (lupa kata sandi lewat email); admin ruang kerja/pemilik platform yang mengatur ulang kata sandi. | Dicatat |
| 6 | Info | Error hidrasi React #418 saat drawer terbuka sejak render pertama (`/app/devices?new=1`). | ✅ Diperbaiki `12b7b2f` |
| 7 | Info | Landing di HP melebar 69 px (pemilih bahasa ikut tampil). | ✅ Diperbaiki `12b7b2f` |

## Gerbang berikutnya (butuh persetujuan owner)

1. Repo GitHub untuk AkunMu dan proyek Vercel yang terhubung.
2. Migrasi Neon (`0000`, `0001`) + bootstrap pemilik platform & ruang kerja pertama.
3. `APP_SECRET` di environment Vercel.

## Addendum — Fase 07 (11 Okt 2026): pohon akun, UI baru, landing

| Area | Hasil | Catatan |
|---|---|---|
| Security | ✅ | `/api/tree` memakai izin `map.read`; asal login divalidasi di service (akun sama, tanpa putaran, dalam RLS ruang kerja); asisten ikut aturan yang sama. Logo, tangkapan layar, dan pustaka disajikan dari situs sendiri (CSP tetap `self`). Tidak ada kolom rahasia baru |
| Database | ✅ | Migrasi `0002` hanya menambah 3 kolom nullable + 1 indeks; tabel tetap dengan RLS paksa |
| Code quality | ✅ | 73 tes (baru: 8 pohon, termasuk 40 hutan acak tanpa tabrakan; 3 asal login), tsc 0, eslint 0, `next build` sukses |
| UI/UX + mobile | ✅ | Pohon terang/gelap/HP, panel detail, drawer asal login, landing desktop/HP/gelap/reduced-motion: 0 galat browser, 0 scroll horizontal |
| Catatan | ℹ️ | React Flow memasang ulang kabel saat elemen di luar layar mendapat fokus; animasi gambar kabel hanya sekali (kelas `tree-settled`) sehingga tidak berkedip |
