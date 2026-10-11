# Architecture Decisions — AkunMu

> Dicatat sesuai loop-v5 aturan #10. Keputusan dari owner ditandai **OWNER**; pilihan yang diisi AI (auto-fill) ditandai **AI** beserta alasannya.

---

## 1. Keputusan Owner (wajib diikuti)

| # | Aspek | Keputusan | Sumber |
|---|---|---|---|
| O1 | Stack | Sama persis dengan EventMu: Next.js + PostgreSQL (Neon) + Drizzle + RLS + Vercel Blob | "technya sama persis seperti event" |
| O2 | Database & storage | Kredensial di `.env` (Neon pooled + unpooled, Vercel Blob) | "di device .env sudah ada" |
| O3 | Deploy | Vercel | "nanti juga bakal di deploy ke vercel" |
| O4 | Workflow | loop-v5 Sainskerta, salinan di `loop-v5/` | "clone dulu loop v5 tadi … harus ada juga di folder device" |
| O5 | Agentic | Asisten AI dengan perilaku sama persis seperti EventMu | "perilaku agenticnya harus sama persis bro!" |
| O6 | Tampilan | **Harus beda** dari EventMu | "tapi tolong UI nya harus beda!" |
| O7 | Bahasa | Kode 100% Inggris; aplikasi `id` + `en`; bahasa baru = 1 file + 1 entri registry | aturan #12 loop-v5 |
| O8 | Nama | Bebas → **AkunMu** (AI) | "terserah kamu kasih nama apa deh suka2 kamu" |
| O9 | Isi | Perangkat → profil browser → akun yang login (penyedia + akun); tahu akun login di mana | pesan 11 Okt 2026 00.15 |

---

## 2. Auto-Fill (AI)

| Aspek | Pilihan | Alasan |
|---|---|---|
| Next.js | 16.4.0 (App Router), React 19.3, TypeScript 6 strict, Tailwind 4 | Sama dengan EventMu (O1) |
| ORM & driver | Drizzle 0.45; `postgres` (postgres.js, `prepare: false`) di produksi, PGlite di tes | Sama dengan EventMu; tes memakai PostgreSQL sungguhan di memori |
| Multi-tenant | Tabel `tenants` (= ruang kerja), `tenant_id` di setiap tabel milik tenant, RLS `ENABLE + FORCE` + policy per tabel, peran DB `akunmu_app` | Sama dengan EventMu; data akun satu ruang kerja tidak pernah terlihat ruang kerja lain |
| Auth | Sesi staf sendiri (token acak, hash SHA-256 di DB, cookie httpOnly), password bcrypt; daftar mandiri membuat ruang kerja + admin | Sama dengan EventMu |
| Peran | `admin` (semua), `editor` (ubah peta login), `viewer` (lihat saja) | Pemakaian pribadi cukup admin; peran lain untuk tim |
| Konsol platform | Pemilik platform: ruang kerja, penyedia AI, staf platform | Sama dengan EventMu |
| AI | Gateway multi-penyedia (Anthropic Messages + OpenAI-compatible), kunci platform + BYOK per ruang kerja, kuota pesan bulanan; asisten dengan tool calling, perubahan lewat kartu konfirmasi | Port mesin EventMu (O5) |
| Tanpa rahasia | Tidak ada kolom password, token, kode pemulihan, atau cookie akun yang dicatat; validasi menolak teks yang tampak seperti rahasia di catatan | Tujuan aplikasi hanya lokasi login; menyimpan rahasia = risiko besar |
| Identitas akun | Email/username disimpan apa adanya (dibutuhkan untuk mencari); hanya terlihat di ruang kerjanya (RLS) | Data pribadi owner sendiri |
| i18n | Registry + `messages/<kode>.json` (sama EventMu) | Aturan #12 |
| Rate limit | Tabel `rate_limits` | Serverless |

---

## 3. Model Data

```
tenants ─┬─ users (staf ruang kerja)
         ├─ devices            perangkat: laptop, PC, HP, tablet
         │    └─ browser_profiles   profil browser di perangkat itu (Chrome "Kerja", Edge "Default")
         ├─ providers          penyedia akun (Google, Microsoft, GitHub, …), bawaan + buatan sendiri
         │    └─ accounts           akun di penyedia itu (email / username)
         └─ sign_ins           akun X sedang login di perangkat Y (di profil browser Z, atau di aplikasi/OS)
```

| Tabel | Kolom penting | Catatan |
|---|---|---|
| `devices` | `name`, `kind` (laptop/desktop/phone/tablet/other), `system` (windows/macos/linux/chromeos/android/ios/ipados/other), `location`, `notes`, `last_checked_at` | Nama boleh sama di ruang kerja berbeda |
| `browser_profiles` | `device_id`, `browser` (chrome/edge/firefox/safari/brave/opera/arc/other), `name`, `sync_account_id`, `color`, `notes` | "Profile B" bisa ada di beberapa perangkat (baris berbeda per perangkat) |
| `providers` | `name`, `slug`, `domain`, `color`, `built_in` | Diisi bawaan saat ruang kerja dibuat, bisa ditambah |
| `accounts` | `provider_id`, `identifier`, `label`, `notes`, `two_factor` | Unik per (`provider_id`, lower(`identifier`)) |
| `sign_ins` | `account_id`, `device_id`, `profile_id` (null = di aplikasi/OS), `app`, `status` (signed_in/signed_out), `since`, `last_verified_at`, `signed_out_at`, `review` (perlu dicek/logout), `notes` | Inti aplikasi: "akun X login di mana saja" = semua `sign_ins` aktif akun X |
| `audit_logs`, `ai_*`, `app_settings`, `rate_limits` | — | Sama dengan EventMu |

Semua tabel: `id` bigint identity, `created_at`, `updated_at`, `deleted_at` (soft delete), tanpa foreign key (indeks biasa), snake_case Inggris.

---

## 4. Arah Tampilan (beda dari EventMu — O6)

| | EventMu | AkunMu |
|---|---|---|
| Kesan | Poster acara: kertas, tinta, stabilo | Peta kendali yang tenang: rapi, padat informasi, aman |
| Huruf | Bricolage Grotesque + Inter | **Plus Jakarta Sans** (UI) + **JetBrains Mono** (email, username, waktu) |
| Warna | Warna situs (merah/navy) + kuning stabilo | Netral slate + **teal** sebagai aksen; warna penyedia sebagai identitas akun |
| Mode | Terang saja | **Terang dan gelap** (mengikuti sistem + tombol) |
| Navigasi | Sidebar putih lebar | **Rail ikon gelap ramping** (ikon satu warna per menu, aturan #6) + **bilah atas** dengan **palet perintah (Ctrl/⌘ K)**; di HP **tab bawah** |
| Layar utama | Dasbor kartu | **Peta login**: kolom Perangkat → Profil → Akun (seperti Finder), di HP bertumpuk |
| Kartu | Kartu putih bayangan | Panel bergaris tipis, sudut 12 px, tanpa aksen garis sisi |

Layar: Peta login · Perangkat (daftar + detail) · Akun (daftar + "login di mana saja") · Penyedia · Asisten AI · Pengaturan (ruang kerja, pengguna, AI) · Konsol platform · Landing + daftar/masuk.

---

## 5. Catatan Implementasi (AI)

| Aspek | Keputusan | Alasan |
|---|---|---|
| Hapus berantai | Hapus perangkat → profil + login ikut ke tempat sampah dengan cap waktu yang sama; pulihkan mengembalikan semuanya. Hapus akun → login-nya ikut. Hapus profil → login di profil itu ikut | Aturan #3 (soft delete & restore) tanpa kehilangan data saat salah hapus |
| Satu login aktif per tempat | Indeks unik `(akun, perangkat, profil, lower(app))` untuk status `signed_in`; logout menyimpan baris sebagai riwayat | "Login di mana saja" selalu jujur; riwayat logout tetap ada |
| "Perlu dicek" | Login yang belum dikonfirmasi 30 hari atau ditandai `review` | Owner jarang logout; pengingat lembut tanpa notifikasi |
| Alat asisten | Baca: find_account, list_devices, get_device, list_accounts, list_providers, get_overview. Ubah (kartu konfirmasi): add_device, add_browser_profile, add_provider, record_sign_ins, sign_out, confirm_sign_ins, mark_for_review, update_account | Perilaku agentik sama dengan EventMu (O5); asisten tidak bisa menghapus apa pun |
| Identitas akun ke AI | Email/username dikirim ke penyedia AI saat dibutuhkan untuk menjawab; kata sandi yang terketik di chat disamarkan sebelum dikirim | Inti fitur "akun X login di mana"; tidak ada rahasia yang tersimpan untuk bocor |
| Daftar mandiri | Nama ruang kerja → alamat (slug) otomatis; tanpa syarat/ketentuan dan tanpa persetujuan Privasimu | AkunMu tidak memakai Privasimu; data hanya milik pemilik ruang kerja |


---

## 6. Pohon Akun (owner, 11 Okt 2026: "temanya adalah pohon")

| Aspek | Keputusan | Alasan |
|---|---|---|
| Asal login | `sign_ins.approved_from_id` + `approval_method` (`code`, `link`, `qr`, `prompt`), migrasi `0002`. Asal harus login dari akun yang sama; tidak boleh berputar (dicek di service) | Kasus owner: CLI di perangkat lain masuk pakai kode/magic link yang disetujui di browser perangkat A |
| Jenis aplikasi | `sign_ins.app_kind` (`app`, `cli`) | CLI tampil sebagai daun bertanda terminal |
| Bentuk pohon | Batang = akun; akar = perangkat tempat login langsung; dahan = perangkat yang dicapai lewat persetujuan (induk = perangkat persetujuan pertama, tanpa siklus); daun = profil browser/aplikasi/CLI. Riwayat: asal yang sudah logout tetap tampil sebagai daun gugur | "kita ngelihat akar akunnya dari device mana, dipakai di dahan & daun device mana" |
| Tata letak | Fungsi murni `src/modules/signins/tree.ts`: pita per subpohon (anak ditumpuk, induk di tengah) → tidak ada node bertabrakan; hutan dipak ke kolom sesuai rasio kanvas. Dijaga tes acak 40 hutan | "gak boleh saling tabrak" |
| Kanvas | React Flow (`@xyflow/react`, MIT) dengan node/kabel sendiri ala ComfyUI; tidak bisa digeser (tata letak otomatis), pan/zoom/minimap | Interaksi node editor yang matang; tata letak tetap milik kita |
| Logo | Browser: `alrra/browser-logos` (MIT), Arc dari Simple Icons; penyedia: Simple Icons (CC0) sebagai mask CSS. Semua di `public/brands` (CSP `self`). Merek milik pemiliknya | "pakai icon2 / logo browser sebenarnya" |
| Landing | Tangkapan layar asli (WebP, id/en) + GSAP 3.15 (ScrollTrigger) untuk cabang tumbuh, layar miring 3D yang tegak saat digulir, tombol magnetik, etalase menempel; semua mati saat `prefers-reduced-motion` | "UI lebih kreatif … gsap … motion boleh" |
| Pohon per perangkat | Mode bawaan (owner 11 Okt 09.40, diperjelas setelah `5f8e5f7`): `src/modules/signins/device-tree.ts` (murni + tes). Batang = perangkat tempat login langsung, cabang = profil/aplikasi/CLI, ranting = penyedia, daun = login. Sesi yang diizinkan dari sebuah login (`approved_from_id`) menggantung dari daun itu sebagai kartu bernama perangkatnya (kolom sendiri, garis berlabel cara masuk), berapa pun banyaknya dan bisa berantai; perangkat yang tak punya login langsung tidak punya pohon sendiri ("Lihat pohonnya" membingkai dan menyorot sesinya di pohon asal). Akun yang sama yang login terpisah menyala saat disorot, dengan satu garis putus-putus per login lain (`relatedSessions`) | "1 device itu 1 tree … daunnya adalah login session di device mana keterangannya" + "dari claude.ai nyambung ke banyak claude code / claude cli di keterangan device mana" |
| Animasi node pohon | Node "tumbuh" lewat `clip-path` (sapuan dari kiri), bukan `transform`: React Flow mengukur posisi port saat node muncul, dan node yang sedang digeser/diskalakan membuat ujung garis meleset ±13 px dari port (terjadi sejak Fase 07, ditemukan lewat QA posisi garis) | Garis harus tepat di titik port |
| Node React Flow terkontrol | Node diberi `measured` = ukuran tata letak (ukurannya pasti), karena tanpa `onNodesChange` React Flow tidak pernah menandai node terukur; pembingkaian/fokus menunggu rasio kanvas terukur | Tanpa ini fokus `?tree=…` tertimpa atau tak jalan |

## 7. Aplikasi Desktop Windows (owner, 11 Okt 2026: "bisa buatkan versi desktop exenya")

| Aspek | Keputusan | Alasan |
|---|---|---|
| Database | PGlite 0.5.8 (PostgreSQL di WebAssembly) di `%APPDATA%\AkunMu\database`, dijalankan proses `desktop/src/db-host.ts` dan disajikan lewat `pglite-socket` di 127.0.0.1; migrasi app (`drizzle/migrations`) dijalankan tiap start | Pilihan owner. SQLite tidak punya RLS/peran: lapisan scope (`set_config` + `akunmu_app`), skema, migrasi, dan tes harus ditulis ulang; PGlite memakai semuanya apa adanya (sudah dipakai tes & QA) |
| Data | Terpisah dan offline; tidak sinkron dengan web (Neon) | Pilihan owner; sinkron = fase sendiri bila diminta |
| Shell | Electron 44: proses utama `desktop/src/main.ts` menjalankan database dan server Next standalone (utility process) di port bebas 127.0.0.1, lalu membuka jendela; satu instance; tutup = server dihentikan lalu database ditutup rapi | Server Next berjalan apa adanya; tanpa modul native (PGlite = WASM), jadi tak perlu rebuild |
| Masuk & mode | Tanpa login: shell membuat kunci acak per peluncuran (`AKUNMU_DESKTOP_TOKEN`) dan membuka `/desktop/start?key=…`. Peluncuran pertama membuat ruang kerja kosong + 2 akun bawaan generik: Pengguna (`user@akunmu.local`, admin ruang kerja; mode bawaan) dan Superadmin (`superadmin@akunmu.local`, konsol platform), keduanya ditemukan lagi lewat peran (bukan email). Menu akun memindah mode (`/desktop/mode`, hanya dari sesi salah satu akun bawaan); tombol keluar disembunyikan; halaman masuk = masuk ulang otomatis sebagai Pengguna (maks 3× / 15 dtk) | Owner: "cuma ada default superadmin dan default user", "kasih mode doang aja di local gak usah login"; rute 404 di web |
| Rahasia | `APP_SECRET` dibuat sekali per instalasi, disimpan terenkripsi Windows (DPAPI, `safeStorage`) di `secret.json`; kunci AI diatur seperti di web (Superadmin: Platform → AI, atau Pengguna: kunci sendiri) | Tidak ada rahasia di installer |
| Build | `desktop/scripts/build.mjs`: `next build` dengan `AKUNMU_DESKTOP=1` → `.next-desktop` (standalone, tanpa `upgrade-insecure-requests`/HSTS, cookie tanpa `Secure` karena http lokal), nilai database & secret palsu; berhenti bila ada file `.env*` atau nilai `.env` web di hasil stage; lalu electron-builder (NSIS + zip, x64, belum ditandatangani) | Build web/Vercel tidak berubah; Neon tak pernah disentuh saat build desktop |
