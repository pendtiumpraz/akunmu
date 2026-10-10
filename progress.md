# Progress — AkunMu

> Source of truth progress project (loop-v5). Diperbarui setiap perubahan status.

---

## Ringkasan

| Item | Status |
|------|--------|
| **Project** | `akunmu` |
| **Fase Aktif** | `Fase 04: Frontend` (QA visual) |
| **Status Loop** | `running` |
| **Dimulai** | `2026-10-11 00:15` |
| **Target Selesai** | — |
| **Progress** | 70% (backend + UI baru selesai, 46 tes lulus; QA visual, audit, deploy menyusul) |

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
### 🔄 Fase 04: Frontend
- [x] Layar: landing, masuk/daftar, peta login, perangkat (+detail), akun (+detail), penyedia, asisten, pengaturan (AI + pengguna), konsol platform
- [x] Bahasa `id` + `en` (file bahasa dibangun ulang dari kunci yang dipakai)
- [ ] QA visual (desktop, HP, terang/gelap) di server lokal dengan basis data lokal
### ⏳ Fase 05: Audit · ⏳ Fase 06: Deployment (butuh persetujuan owner: repo GitHub, proyek Vercel, migrasi Neon, `APP_SECRET`)

---

## Issue & Blocker

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Env (Neon, Blob) belum ada; build lokal tetap jalan dengan PGlite | Medium | ✅ `.env` dari owner (11 Okt 00.40) |
| 2 | Repo GitHub + proyek Vercel untuk AkunMu belum ada | Medium | ⏳ menunggu owner di gerbang deploy |

---

## Log Perubahan

| Waktu | Fase | Catatan |
|---|---|---|
| 2026-10-11 00:20 | 00 | Kickoff: folder, loop-v5, requirement; antre setelah modul rekap EventMu |
| 2026-10-11 02:30 | 03–04 | Backend + UI baru selesai; 46 tes, tsc, lint lulus; lanjut QA visual |
