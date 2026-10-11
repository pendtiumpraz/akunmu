# Progress — AkunMu

> Source of truth progress project (loop-v5). Diperbarui setiap perubahan status.

---

## Ringkasan

| Item | Status |
|------|--------|
| **Project** | `akunmu` |
| **Fase Aktif** | `Fase 07: Improvement` — Pohon akun + UI baru + landing: live (migrasi `0002`, push 11 Okt) |
| **Status Loop** | `waiting` |
| **Dimulai** | `2026-10-11 00:15` |
| **Target Selesai** | — |
| **Progress** | Live dipakai owner (ruang kerja Pribadi); Fase 07 terpush |

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
### 🔄 Fase 07: Improvement — Pohon akun (owner 11 Okt 08.10–08.25)
- [x] Asal login: `approved_from_id` + `approval_method` (kode, magic link, QR, konfirmasi) + `app_kind` (aplikasi/CLI), migrasi `0002` (hanya tambah kolom); validasi akun sama + tanpa putaran; drawer "Asal login"; lencana "Masuk lewat …"; asisten bisa mencatat asal (`grewFromSignInId`)
- [x] Logo asli: browser (Chrome, Edge, Firefox, Safari, Brave, Opera, Arc, + Vivaldi, Samsung Internet) dan 19 penyedia, disajikan dari `public/brands`
- [x] Tampilan **Pohon** (bawaan halaman utama): batang akun → akar → dahan → daun, kabel ala ComfyUI berlabel cara masuk, sorot garis keturunan, panel detail, riwayat (daun gugur), cari, legenda, minimap; tata letak tanpa tabrakan (tes 40 hutan acak), dipak ke kolom
- [x] Dashboard: logo pohon, rail hijau hutan, menu "Pohon", angka menghitung naik, tombol tekan, daun bergoyang
- [x] Landing baru: tangkapan layar asli (id/en), GSAP (cabang tumbuh, layar 3D, tombol magnetik, etalase menempel), aman untuk reduced motion
- [x] QA: 73 tes, tsc, lint, build; tangkapan layar terang/gelap/HP tanpa galat; 0 node bertumpuk
- [x] Izin owner ("migrate dan push", 11 Okt): migrasi `0002` diterapkan di Neon + diverifikasi (3 kolom nullable + indeks, RLS paksa utuh, 3 login owner tak berubah); push `main` → Vercel
- [x] **Pohon per perangkat** (owner 09.40: "1 device itu 1 tree … chrome profile di cabang, provider di ranting, daunnya login session"): mode bawaan Pohon = batang perangkat → cabang profil/aplikasi/CLI → ranting penyedia → daun sesi (keterangan "dari PC #1 · kode" / "juga di N perangkat lain"); sorot/pilih sesi menyalakan sesi akun yang sama di perangkat lain + kabel izin (berlabel) dan akun sama (putus-putus); mode "Per akun" tetap ada; tautan "Lihat pohonnya" di detail akun/perangkat (`/app?tree=device-<id>`, `account-<id>`); istilah "sesi aktif"
- [x] Hero landing: pohon dekoratif digambar ulang dari simpul (garis tepat di titik, diuji), titik tak lagi bergeser (animasi lewat radius, bukan transform)
- [x] QA: 80 tes; 55 node mode perangkat & 42 node mode akun tanpa tumpang tindih; celah titik-garis hero 0,00 px; 0 galat browser
- [x] Izin owner ("migrate dan push", 11 Okt): tidak ada migrasi baru (migrator dijalankan ulang, Neon tetap `0000`–`0002`); push `5f8e5f7` → Vercel; owner cek hero live: aman
- [x] **Sesi menggantung dari login asalnya** (owner: "dari claude.ai nyambung ke banyak claude code / claude cli di keterangan device mana … bukan … tree device lain buka claude code langsung"): sesi yang diizinkan dari sebuah login (CLI pakai kode, aplikasi pakai link, …) kini tumbuh dari daun login itu sebagai kartu bernama perangkatnya, berapa pun banyaknya dan bisa berantai; perangkat yang semua sesinya diizinkan dari perangkat lain tidak lagi punya pohon sendiri ("Lihat pohonnya" membingkai dan menyorot sesinya di pohon asal); garis putus-putus hanya ke login lain akun itu; batang menampilkan jumlah perangkat lain yang dijangkau
- [x] Garis tepat di port: animasi tumbuh tidak lagi menggeser node (React Flow mengukur port saat node muncul; sebelumnya ujung garis meleset ±13 px); pembingkaian menyisakan ruang legenda; efek hover batang tak lagi menggeser port
- [x] QA: 82 tes (6 pohon perangkat: 40 hutan acak dengan rantai/kipas izin, tanpa tumpang tindih, tiap sesi digambar sekali); tangkapan layar terang/gelap/en/HP: 44 node, 13 sesi tumbuh, 0 tumpang tindih, 0 garis lepas dari port, 0 galat browser
- [ ] Izin owner untuk push perubahan ini

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
| 2026-10-11 07:45 | 06 | Akun: superadmin + 3 ruang kerja (Pribadi, Privasimu, Sainskerta) |
| 2026-10-11 09:10 | 07 | Pohon akun, asal login, logo asli, dashboard + landing baru; 73 tes; commit lokal |
| 2026-10-11 09:25 | 07 | Owner: "migrate dan push" → Neon `0002` + push |
| 2026-10-11 10:10 | 07 | Pohon per perangkat (cabang/ranting/daun), sesi lintas perangkat, perbaikan hero; commit lokal |
