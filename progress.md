# Progress — AkunMu

> Source of truth progress project (loop-v5). Diperbarui setiap perubahan status.

---

## Ringkasan

| Item | Status |
|------|--------|
| **Project** | `akunmu` |
| **Fase Aktif** | `Fase 06: Deployment` — Neon + GitHub selesai, menunggu proyek Vercel |
| **Status Loop** | `waiting` |
| **Dimulai** | `2026-10-11 00:15` |
| **Target Selesai** | — |
| **Progress** | 95% (Neon termigrasi, repo GitHub terpush; tinggal Vercel + akun pertama) |

---

## Fase

### ✅ Fase 00: Prerequisites
- [x] Folder `D:/AI/privasimu/device`, repo git `main`
- [x] Salinan `loop-v5` (sama dengan EventMu, termasuk aturan #12 bahasa kode)
- [x] Requirement owner dicatat verbatim (`user_requirement.md`)
- [x] Database credentials (Neon pooled + unpooled) di `.env` (owner, 11 Okt 00.40; di-gitignore, nilai tidak dicetak)
- [x] Storage credentials (Vercel Blob) di `.env`
- [x] Target deploy: Vercel (owner: "nanti juga bakal di deploy ke vercel")
- [ ] `APP_SECRET` untuk Vercel (dipasang owner di Vercel saat deploy)
### ✅ Fase 01: Planning
- [x] Model data: ruang kerja → perangkat → profil browser; penyedia → akun; login (akun × perangkat × profil/aplikasi)
- [x] Keputusan arsitektur (`architecture-decisions.md`): stack sama EventMu, UI berbeda
### ✅ Fase 02: Wireframe & Audit — approval lewat instruksi langsung owner (sama seperti EventMu)
- [x] Arah visual baru: slate + teal, Plus Jakarta Sans + JetBrains Mono, terang/gelap, rail ikon gelap + bilah atas + palet ⌘K, peta login berkolom
### ✅ Fase 03: Backend
- [x] Migrasi `0000_init` (15 tabel) + `0001_rls` (peran `akunmu_app`, RLS ENABLE + FORCE di semua tabel ruang kerja)
- [x] Modul perangkat, profil browser, penyedia (26 bawaan), akun, login; hapus berantai + pulihkan
- [x] API: `/api/map`, `/api/overview`, `/api/devices`, `/api/profiles`, `/api/providers`, `/api/accounts`, `/api/sign-ins` (+ tempat sampah & pulihkan)
- [x] Asisten AI: 6 alat baca + 8 alat ubah (kartu konfirmasi), sebut @perangkat/@akun, perintah `/`
- [x] Tes: domain peta login, isolasi RLS, platform, agen AI, gateway AI, aturan bahasa kode — 46/46 lulus
### ✅ Fase 04: Frontend
- [x] Layar: landing, masuk/daftar, peta login, perangkat (+detail), akun (+detail), penyedia, asisten, pengaturan (AI + pengguna), konsol platform
- [x] Bahasa `id` + `en` (file bahasa dibangun ulang dari kunci yang dipakai; nada "kamu")
- [x] QA visual: 35 tangkapan layar (terang, gelap, HP 390 px) di server produksi lokal + basis data lokal; perbaikan `12b7b2f`
### ✅ Fase 05: Audit — selesai (`audit-report.md`), disetujui owner
- [x] Security, performance, code quality, i18n, UI/UX, mobile, database
- [x] Approval owner ("migrate neon , ku buatkan githubnya", 11 Okt 06.55)
### 🔄 Fase 06: Deployment
- [x] Migrasi Neon `0000_init` + `0001_rls` (proyek Neon sendiri, terpisah dari EventMu). Diverifikasi: 15 tabel, RLS ENABLE + FORCE + kebijakan di semua tabel ruang kerja, peran `akunmu_app` NOBYPASSRLS
- [x] Repo GitHub `pendtiumpraz/akunmu` (dibuat owner), `main` terpush
- [x] `APP_SECRET` dibuat di `.env` lokal (tidak dicetak)
- [ ] Proyek Vercel terhubung ke repo + env `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `APP_SECRET`
- [x] Akun pemilik platform + 3 ruang kerja: `pribadi` (admin = alamat Gmail owner dengan akhiran `+pribadi`, karena email harus unik per akun), `privasimu`, `sainskerta` (masing-masing email kerja owner); alamat email disamarkan atas permintaan owner; kata sandi sementara di `.bootstrap-credentials.txt` (di-gitignore)
- [ ] Kunci AI di `/platform/ai` (`claude-haiku-5-5`)

---

## Issue & Blocker

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Env (Neon, Blob) belum ada; build lokal tetap jalan dengan PGlite | Medium | ✅ `.env` dari owner (11 Okt 00.40) |
| 2 | Repo GitHub + proyek Vercel untuk AkunMu belum ada | Medium | ⏳ repo GitHub ✅ (11 Okt); proyek Vercel menunggu owner |

---

## Log Perubahan

| Waktu | Fase | Catatan |
|---|---|---|
| 2026-10-11 00:20 | 00 | Kickoff: folder, loop-v5, requirement; antre setelah modul rekap EventMu |
| 2026-10-11 02:30 | 03–04 | Backend + UI baru selesai (`1db0214`); 46 tes, tsc, lint lulus |
| 2026-10-11 02:45 | 04 | QA visual di server lokal (PGlite, AI tiruan); perbaikan hidrasi drawer, rail, HP (`12b7b2f`) |
| 2026-10-11 03:00 | 05 | Audit selesai (`audit-report.md`), 62 tes; berhenti di gerbang approval 05/06 |
| 2026-10-11 06:58 | 06 | Approval owner; migrasi Neon `0000`–`0001` diterapkan + diverifikasi; repo GitHub `pendtiumpraz/akunmu` |
