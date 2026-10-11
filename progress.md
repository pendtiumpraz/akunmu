# Progress — AkunMu

> Source of truth progress project (loop-v5). Diperbarui setiap perubahan status.

---

## Ringkasan

| Item | Status |
|------|--------|
| **Project** | `akunmu` |
| **Fase Aktif** | `Fase 09: Unduh & hubungkan` — ekstensi browser, AkunMu Desktop Windows + Linux, buka profil dari web/desktop |
| **Status Loop** | `waiting` |
| **Dimulai** | `2026-10-11 00:15` |
| **Target Selesai** | — |
| **Progress** | Live dipakai owner (ruang kerja Pribadi); Fase 09 terpush + Neon `0003`; menunggu rilis GitHub `v0.1.0` untuk tautan unduh desktop |

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
- [x] Izin owner ("push", 11 Okt): tanpa migrasi baru (Neon tetap `0000`–`0002`); `8a45c46` dipush → Vercel
- [x] Favicon (owner: "untuk eventmu dan akunmu tolong tambahkan favicon"): `icon.svg` (ikut tema gelap), `favicon.ico` 16/32/48, `apple-icon.png` 180
- [x] **Pemilih penyedia** (owner: "jadikan dropdown select search, ada + tambah provider di paling bawah … cukup keluar field baru penambahan provider"): di Tambah akun & Catat login, daftar penyedia yang bisa dicari (logo, nama, domain; panah/Enter/Esc), "+ Tambah penyedia" / "Tambah “…”" di paling bawah memunculkan field nama penyedia baru; penyedia dibuat saat disimpan (warna dari nama, nama yang sama dipakai ulang); QA: "Jira Kantor" dibuat + akun tercatat
### 🔄 Fase 08: Desktop Windows (owner 11 Okt: "bisa buatkan versi desktop exenya kah?")
- [x] Keputusan owner: database PGlite (bukan SQLite), data terpisah & offline
- [x] Mode desktop di app (`AKUNMU_DESKTOP`): masuk otomatis lewat `/desktop/start` dengan kunci per peluncuran (404 di web), pemilik + ruang kerja dibuat saat peluncuran pertama dan ditemukan lewat peran, tombol keluar disembunyikan, landing → `/app`, cookie tanpa `Secure` (http lokal), CSP tanpa `upgrade-insecure-requests`
- [x] Shell Electron 44 (`desktop/`): proses database PGlite + migrasi tiap start, server Next standalone, jendela + layar pembuka, menu id/en (folder data & log), satu instance, berhenti rapi, `secret.json` dilindungi DPAPI
- [x] Build `desktop/scripts/build.mjs`: `.next-desktop` standalone, nilai palsu untuk database & secret, penjaga `.env`, installer NSIS + zip
- [x] Bahasa: Indonesia otomatis bila Windows berbahasa Indonesia atau region Indonesia (mesin owner: UI `en-US`, region `en-ID`); pilihan bahasa di app tetap menang. Jendela maksimal di peluncuran pertama
- [x] ~~Pengaturan AI di desktop: hanya "kunci sendiri"~~ → diganti: desktop kini punya superadmin lokal, jadi AI diatur seperti di web (Platform → AI, atau kunci sendiri)
- [x] **Mode tanpa login** (owner: "yg local kosongkan dulu jangan ada user, cuma ada default superadmin dan default user", "kasih mode doang aja di local gak usah login"): peluncuran pertama membuat 2 akun bawaan generik (Pengguna `user@akunmu.local` = admin ruang kerja Pribadi/Personal, Superadmin `superadmin@akunmu.local` = konsol platform), tanpa data dan tanpa nama Windows; menu akun punya "Pindah ke mode superadmin/pengguna" (`/desktop/mode`, hanya dari sesi salah satu akun bawaan); QA paket: mulai sebagai Pengguna, pindah ke konsol & kembali, buka ulang tetap Pengguna dengan data tersimpan
- [x] QA paket (`win-unpacked\AkunMu.exe`, data di folder uji): peluncuran pertama 8 dtk (PGlite dibuat + migrasi), masuk otomatis sebagai pemilik; contoh owner (PC #1 Chrome claude.ai → Claude Code CLI di Laptop ASUS & Acer, kode) tampil sebagai 2 kartu sesi; buka ulang 3,7 dtk, data tetap; kunci salah = 404; landing → `/app`; tanpa tombol keluar; server & database berhenti rapi (kode 0). Rilis dipindai: 0 file `.env`, 0 nilai `.env`. 87 tes, tsc, lint lulus
- [x] Ditemukan & diperbaiki saat QA: electron-builder membuang `node_modules` dan folder bertitik (`.next-desktop`) dari `extraResources` → disalin lewat hook `afterPack`; `pid` proses belum ada sebelum spawn; server standalone menyebut dirinya `localhost` → redirect relatif + jendela dikembalikan ke 127.0.0.1
- [x] Izin owner ("push", 11 Okt): desktop, favicon, mode desktop, pemilih penyedia dipush → Vercel; tanpa migrasi Neon; installer tidak masuk git (dibagikan lewat `Downloads\akunmu-desktop`)

### 🔄 Fase 09: Unduh & hubungkan (owner 11 Okt sore: "chrome extension yang dipakai sweep chrome profile dan devicenya … masukkan aja di halaman download & connect")
- [x] Keputusan owner: semua sekaligus; temuan = **saran yang disetujui** (login yang sudah tercatat dan terlihat lagi dikonfirmasi otomatis); ekstensi dibagikan sebagai **zip, dipasang manual**; landing: tombol unduh Windows + Linux (macOS belum ada)
- [x] Migrasi `0003_connect` (hanya tambah): tabel `ingest_tokens` (kunci per perangkat, hanya hash SHA-256 + 4 karakter terakhir) dan `findings` (sidik jari unik per ruang kerja, status baru/diterima/diabaikan), kolom `devices.hostname` dan `browser_profiles.directory`; RLS ENABLE + FORCE + kebijakan `tenant_isolation` di kedua tabel baru
- [x] API ingest (`/api/ingest/hello`, `/api/ingest/report`): `Authorization: Bearer akm_…`, tanpa sesi/cookie, 120 laporan/jam per kunci, dijalankan dalam ruang kerja pemilik kunci. Laporan: yang belum ada → temuan; login tercatat yang terlihat lagi → dikonfirmasi (maks sekali sejam, audit `system`); login tercatat di situs yang dicek tapi tak terlihat → ditandai perlu dicek (tidak pernah di-logout)
- [x] Halaman **Unduh & hubungkan** (`/app/connect`, menu "Hubungkan" di bawah rail): unduhan (Windows .exe, Linux .tar.gz, ekstensi .zip; macOS "belum tersedia"), temuan per tempat (terima, abaikan, terima semua; akun yang tak terbaca diketik di barisnya), kunci ekstensi (dibuat per perangkat, tampil sekali + alamat + salin, dicabut), tutorial lengkap ekstensi & desktop, catatan privasi
- [x] **Ekstensi browser** (`extension/`, MV3, id/en): popup (nama profil, browser, sambungan ke web dan/atau AkunMu Desktop, "Periksa sekarang", "Cari juga situs lain"), service worker (lapor saat terhubung, tiap 6 jam, saat browser dibuka bila sudah lama). Deteksi dari **nama** cookie per situs (Google + daftar akun Google seperti Chrome sendiri, GitHub + nama pengguna dari cookie, Claude, ChatGPT, X, Facebook, Instagram, LinkedIn, Slack, Notion, Netflix, Spotify, Apple, Microsoft, GitLab, AWS) dan pola nama cookie login untuk situs lain; yang dikirim hanya domain + nama akun yang terbaca. Zip dibuat ulang tiap build (`npm run extension:pack`, tanpa paket, cap waktu tetap)
- [x] **AkunMu Desktop** (Windows + Linux): halaman Hubungkan punya "Komputer ini" (nama komputer, perangkat yang mewakilinya, pindai profil Chrome/Edge/Brave/Vivaldi dari `Local State`, buka profil sekali klik); port tetap `127.0.0.1:47821` (cadangan 47822–47825) yang hanya meneruskan `/api/ingest/*` ke server app, sehingga ekstensi bisa melapor ke desktop; hello desktop memberi nama komputer → ekstensi mengirimnya di semua laporan → web tahu perangkat mana komputer itu; laporan ke desktop memakai nama & folder profil asli dari komputer itu
- [x] **Buka di profil**: di menu sesi (detail perangkat/akun/peta) dan panel pohon, untuk profil Chromium di perangkat yang punya nama komputer. Desktop: langsung membuka browser `--profile-directory` (tanpa shell). Web: tautan `akunmu://open?…` → AkunMu Desktop di komputer itu (didaftarkan saat start; Linux menulis entri menu sendiri) → `/desktop/open` dengan kunci peluncuran; profil hanya dibuka bila nama komputer cocok, selain itu notifikasi
- [x] Nama komputer di form perangkat (opsional, hanya laptop/PC/lainnya; satu nama = satu perangkat, duplikat ditolak)
- [x] Landing: tombol Windows & Linux di hero, menu "Unduh", bagian unduhan (3 kartu, macOS belum tersedia); catatan hero diperbarui ("Ekstensi browser opsional")
- [x] Paket desktop: `--win --linux`, nama aset tanpa versi (`AkunMu-Setup-x64.exe`, `AkunMu-win-x64.zip`, `AkunMu-linux-x64.tar.gz`) agar tautan "rilis terbaru" tetap; folder data khusus (`AKUNMU_DATA_DIR`) tidak mengambil alih tautan `akunmu://` sistem
- [x] QA: build web lokal (PGlite) — kunci dibuat di UI, ekstensi asli (Chromium, unpacked) terhubung: kunci salah ditolak, laporan → 4 temuan (profil, Claude tanpa akun, GitHub `galih-qa`, situs lain), terima semua + isi akun Claude; nama komputer disimpan & duplikat 422; menu "Buka di profil" menyerahkan `akunmu://open?browser=chrome&profile=Kerja&host=…&url=https://github.com`; HP 390 px tanpa gulir samping; 0 galat konsol. Paket desktop: pindai komputer ini → 17 temuan diterima (perangkat + 8 profil + akun Google), port 47821: hello 200 + nama komputer, tanpa kunci 401, jalur lain 404; ekstensi asli melapor ke desktop dan menyimpan nama komputer
- [x] Izin owner ("migrate dan push", 11 Okt): migrasi `0003` diterapkan di Neon + diverifikasi (4 migrasi; `findings` & `ingest_tokens` RLS ENABLE + FORCE + `tenant_isolation`, hak `akunmu_app` lengkap, tanpa scope 0 baris; `devices.hostname` & `browser_profiles.directory` nullable; data lama tetap: 3 ruang kerja, 5 perangkat, 19 profil, 3 akun, 4 login); push `main` → Vercel
- [ ] Rilis GitHub `v0.1.0` di `pendtiumpraz/akunmu` berisi 3 aset desktop (tautan unduh mengarah ke "latest release")

---

## Issue & Blocker

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Env (Neon, Blob) belum ada; build lokal tetap jalan dengan PGlite | Medium | ✅ `.env` dari owner (11 Okt 00.40) |
| 2 | Repo GitHub + proyek Vercel untuk AkunMu belum ada | Medium | ⏳ repo GitHub ✅ (11 Okt); proyek Vercel menunggu owner |
| 3 | Tautan unduh desktop mengarah ke rilis GitHub terbaru, yang belum ada | Medium | ⏳ menunggu owner membuat rilis `v0.1.0` + mengunggah 3 aset (atau memberi token) |
| 4 | Simpan Pengaturan → AI gagal di produksi (AkunMu & EventMu) | High | ⏳ menunggu owner: cek `APP_SECRET` di Vercel AkunMu, kirim teks galat EventMu |

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
| 2026-10-11 14:50 | Data | Permintaan owner: 16 profil Chrome ditambahkan di Neon, ruang kerja Pribadi (PC #1: 3 profil; laptop Acer: 2 profil; laptop ASUS: 11 profil; nama profil disamarkan atas permintaan owner) lewat service app (RLS + audit), dicek kering dulu |
| 2026-10-11 15:20 | Isu | Simpan Pengaturan → AI gagal di produksi (AkunMu & EventMu): tidak ada konfigurasi AI tersimpan di kedua Neon; upsert ke `app_settings` diuji (rollback) dan berhasil; di lokal simpan berhasil → dugaan `APP_SECRET` belum dipasang di Vercel AkunMu; menunggu cek owner |
| 2026-10-11 16:20 | 09 | Unduh & hubungkan: migrasi `0003`, API ingest, temuan, ekstensi MV3, port & tautan desktop, Buka di profil, Linux, landing; QA web + paket desktop + ekstensi asli; commit lokal, menunggu izin "migrate dan push" |
| 2026-10-11 16:35 | 09 | Owner: "migrate dan push" → Neon `0003` diterapkan + diverifikasi; push `main` |
| 2026-10-11 16:55 | 09 | Asisten: tampilan awal tak perlu digulir lagi (owner: "UI asisten kebesaran … perlu scroll"): sapaan ringkas + saran di tengah, kotak tulis lebih pendek, placeholder & penafian pendek, saran ke-4 disembunyikan di HP pendek; diukur lokal 1366×657, 1536×730, 390×740, 360×640: luber 155/82/367/– px → 0 (360×640: 8 px padding); percakapan tetap normal; commit lokal, menunggu izin push |
