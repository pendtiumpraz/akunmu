# Progress — AkunMu

> Source of truth progress project (loop-v5). Diperbarui setiap perubahan status.

---

## Ringkasan

| Item | Status |
|------|--------|
| **Project** | `akunmu` |
| **Fase Aktif** | `Fase 12: Proyek (buah di pohon)` — apa yang dikerjakan tiap sesi, dengan tangkapan layar di Vercel Blob |
| **Status Loop** | `waiting` |
| **Dimulai** | `2026-10-11 00:15` |
| **Target Selesai** | — |
| **Progress** | Live dipakai owner (ruang kerja Pribadi); Fase 10 live (Neon `0004`; tinggal `CRON_SECRET` di Vercel); Fase 11 (profil CLI) dan Fase 12 (proyek, Neon `0005`) live 13 Okt; versi 0.2.0 + rilis desktop `v0.2.0`; tinggal owner cek `BLOB_READ_WRITE_TOKEN` di Vercel |

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
- [x] Izin owner ("migrate dan push", 11 Okt): tidak ada migrasi baru (migrator dijalankan ulang, Neon tetap `0000`–`0002`); push `a7923d0` → Vercel; owner cek hero live: aman
- [x] **Sesi menggantung dari login asalnya** (owner: "dari claude.ai nyambung ke banyak claude code / claude cli di keterangan device mana … bukan … tree device lain buka claude code langsung"): sesi yang diizinkan dari sebuah login (CLI pakai kode, aplikasi pakai link, …) kini tumbuh dari daun login itu sebagai kartu bernama perangkatnya, berapa pun banyaknya dan bisa berantai; perangkat yang semua sesinya diizinkan dari perangkat lain tidak lagi punya pohon sendiri ("Lihat pohonnya" membingkai dan menyorot sesinya di pohon asal); garis putus-putus hanya ke login lain akun itu; batang menampilkan jumlah perangkat lain yang dijangkau
- [x] Garis tepat di port: animasi tumbuh tidak lagi menggeser node (React Flow mengukur port saat node muncul; sebelumnya ujung garis meleset ±13 px); pembingkaian menyisakan ruang legenda; efek hover batang tak lagi menggeser port
- [x] QA: 82 tes (6 pohon perangkat: 40 hutan acak dengan rantai/kipas izin, tanpa tumpang tindih, tiap sesi digambar sekali); tangkapan layar terang/gelap/en/HP: 44 node, 13 sesi tumbuh, 0 tumpang tindih, 0 garis lepas dari port, 0 galat browser
- [x] Izin owner ("push", 11 Okt): tanpa migrasi baru (Neon tetap `0000`–`0002`); `6ebaab6` dipush → Vercel
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
- [x] Rilis GitHub `v0.1.0` di `pendtiumpraz/akunmu` (izin owner "ya, push dan buat rilisnya", 11 Okt): `AkunMu-Setup-x64.exe`, `AkunMu-win-x64.zip`, `AkunMu-linux-x64.tar.gz` (build ulang dengan perbaikan asisten); tautan `releases/latest/download/…` → 302 ke berkas, ukuran sama dengan berkas lokal; dibuat lewat API dengan login GitHub yang tersimpan di Git (token tidak dicetak)

### 🔄 Fase 10: Kepatuhan privasi UU PDP & PP 33/2026 (owner 12 Okt: "gas lagi cek apa yang bisa di tambah di eventmu dan akunmu! … full ropa … DPIA … download … pdf dan docx … settings harus ber tab tab")
- [x] RoPA ruang kerja (6 aktivitas: perangkat, akun, peta login, ekstensi & desktop, asisten, permintaan) + RoPA platform (4 aktivitas pengendali + 6 catatan prosesor, PP 33/2026 Pasal 74 ayat (5)); isi dari katalog, angka langsung, lokasi data terdeteksi; koreksi per bahasa, aktivitas buatan sendiri, tandai ditinjau, kembalikan ke bawaan
- [x] DPIA (threshold 7 kriteria, kebutuhan & proporsionalitas, register risiko 5×5 + kontrol + residual, langkah, saran PPDP, kesimpulan & persetujuan) dan register insiden (tenggat 3 x 24 jam)
- [x] Unduh per aktivitas RoPA, per DPIA, per insiden, dan seluruh register: PDF + DOCX, bahasa id/en (mesin dokumen sama dengan EventMu, aksen teal AkunMu)
- [x] Permintaan subjek data: diajukan pengguna di Pengaturan → Data saya ke admin ruang kerja atau operator; dijawab staf di Privasi (atau dicatat dari email); tenggat 3 x 24 jam; hapus hanya bila sudah ditutup
- [x] Persetujuan: daftar wajib menyetujui Ketentuan & Kebijakan Privasi (`/legal/terms`, `/legal/privacy`, id/en), kabar produk terpisah & dapat ditarik; bukti per versi kebijakan; spanduk minta tinjau ulang bila versi berubah
- [x] Data saya: unduh JSON, riwayat persetujuan, permintaan, hapus akun (admin terakhir ditolak), hapus seluruh ruang kerja (satu transaksi; ruang kerja lain aman)
- [x] Retensi: temuan yang sudah diproses, tempat yang sudah logout, percakapan asisten (ruang kerja); log audit (platform); cron harian `/api/cron/retention` (butuh `CRON_SECRET`)
- [x] Pengaturan bertab (tanpa gulir panjang): Ruang kerja · Privasi · AI asisten · Pengguna · Data saya; konsol platform: Privasi + Pengaturan (Operator · PPDP & retensi · Lokasi data)
- [x] Migrasi `0004_compliance` (5 tabel; RLS ENABLE + FORCE: `tenant_isolation` untuk 4 tabel, `platform_only` untuk `account_consents`)
- [x] Tes: 3 berkas baru (kepatuhan, hak subjek data, konten) + terkait; tsc, lint, build lulus; QA visual lokal (PGlite) 39 tangkapan, 0 galat konsol; PDF/DOCX diperiksa
- [x] Izin owner ("migrate dan push", 12 Okt 19.25): migrasi `0004` diterapkan di Neon + diverifikasi (5 migrasi; 5 tabel baru RLS ENABLE + FORCE, `tenant_isolation` × 4 + `platform_only` di `account_consents`, hak `akunmu_app` lengkap, tanpa scope 0 baris, `account_consents` 0 baris dalam scope ruang kerja; data lama tetap: 3 ruang kerja, 4 pengguna, 5 perangkat, 19 profil, 3 akun, 4 login, 22 temuan); push `main` → Vercel
- [ ] `CRON_SECRET` di Vercel AkunMu (owner), opsional `PLATFORM_OPERATOR_NAME` / `PLATFORM_CONTACT_EMAIL`

### 🔄 Fase 11: Profil CLI — banyak akun Claude Code per perangkat (owner 13 Okt: "sekarang 1 device juga bisa multi account claude-cli")
- [x] Profil CLI: satu perangkat menyimpan banyak akun Claude Code, masing-masing satu perintah dengan folder konfigurasinya sendiri (`claude-kerja` → `~/.claude-kerja`, lewat `CLAUDE_CONFIG_DIR`). Disimpan di tabel profil (`browser_profiles.browser = claude-code`, `directory` = folder), **tanpa migrasi**
- [x] Detail perangkat: bagian "Profil CLI" (yang sudah login dulu; yang belum login ringkas dengan lencana "belum login"), form tambah/ubah profil CLI (alat, perintah, folder terisi dari nama perintah), catat login di profil CLI dengan penyedia Claude terisi otomatis; peta kolom (grup "Profil CLI"), pohon (cabang profil CLI sesudah profil browser), asisten (`add_browser_profile` menerima `claude-code` + folder)
- [x] AkunMu Desktop: pindai "Komputer ini" juga menemukan profil Claude Code (`~/.claude` dan tiap `~/.claude-<nama>`) beserta akun Claude yang login (email dari `.claude.json`; `.credentials.json` tidak pernah dibuka) → temuan; akun tercatat yang sudah logout ditandai perlu dicek
- [x] Tes: 55 lulus (8 berkas; baru: pemindai folder, profil CLI per perintah, urutan cabang pohon, pemindaian desktop); tsc, lint lulus; QA visual lokal (build produksi + PGlite): 11 tangkapan terang/gelap/en/HP 390 px, 0 galat, 0 luber samping, pohon 0 tumpang tindih dan 0 garis lepas dari port
- [x] Data owner (13 Okt, Neon, ruang kerja Pribadi, lewat service app, dicek kering dulu): claude.ai di profil Chrome + Claude Desktop yang masuk lewat link darinya, di Laptop Privasimu Acer (profil Chrome baru), PC #1 dan Laptop ASUS; email dan nama profil disamarkan di sini
- [x] Izin owner ("migrate dan push", 13 Okt): push `main`; 41 profil CLI dicatat di 5 perangkat lewat service app (8 perintah per perangkat, PC #1 tambah 1), dicek kering dulu, dijalankan ulang tanpa perubahan
- [x] Rilis desktop diperbarui (owner 13 Okt: "update juga rilis desktopnya"): build ulang dari `main` (`379db5b`, membawa Fase 10–12 + migrasi `0004`/`0005`), 3 aset rilis `v0.1.0` diganti (nama sama, tautan tetap; diunggah dengan nama sementara dulu sehingga tautan tak pernah putus), catatan rilis diperbarui. QA paket Windows: data buatan rilis lama (migrasi `0000`–`0003`) di-upgrade tanpa hilang, pindai komputer menemukan 10 profil Claude Code dan semuanya tercatat, tangkapan layar proyek disimpan di folder data dan tampil, PDF/DOCX RoPA dibuat offline, dibuka ulang tetap sehat, 0 galat; paket Linux berisi berkas yang sama
- [x] Perbaikan desktop (owner 13 Okt: "perbaiki bug secret.json itu, lalu push"): bila kunci di `secret.json` tidak bisa dibaca (folder data dari komputer atau pengguna Windows lain, `Local State` direset, berkas rusak) aplikasi tidak lagi berhenti saat dibuka: berkas lama disisihkan sebagai `secret.json.unreadable-…`, kunci baru dibuat, pohon utuh, kunci AI tersimpan terbaca "belum diatur" dan dimasukkan ulang; pemberitahuan id/en + log (`desktop/src/secret.ts`). Tes unit 4 kasus; uji paket: folder dipindah (tanpa `Local State`) tetap terbuka dengan data utuh, kunci AI bisa dimasukkan ulang, dibuka lagi tidak diganti lagi; instalasi baru normal. Aset rilis `v0.1.0` diganti lagi dengan build ini (`a5f58a6`)
- [x] Versi 0.2.0 (owner 13 Okt: "naikkan versinya jadi 0.2.0 lalu rilis"): web + desktop 0.2.0 (`package.json` + lockfile, `f05b83d`); build desktop 0.2.0 (installer dan aplikasi melapor 0.2.0); QA upgrade dari data buatan rilis 0.1.0 lulus (0 galat); rilis GitHub `v0.2.0` (tag di commit versi, ditandai terbaru, catatan "New in 0.2.0" + cara upgrade), nama berkas sama sehingga tautan `releases/latest/download/…` di aplikasi dan landing pindah ke 0.2.0; `v0.1.0` tetap ada
- [x] Aset lama rilis `v0.1.0` dihapus (owner 13 Okt: "hapus aset lama di rilis v0.1.0"): 3 berkas (build `a5f58a6` berlabel 0.1.0) dihapus; rilis dan tag `v0.1.0` tetap, bagian unduhan di catatannya kini menunjuk ke rilis terbaru; tautan `releases/download/v0.1.0/…` kini 404, tautan `releases/latest/download/…` tetap 0.2.0 (ukuran sama dengan build lokal)

### 🔄 Fase 12: Proyek — buah di pohon (owner 13 Okt: "… mengerjakan [situs] kamu screenshot lalu pasang screenshotnya di sana masukkan ke blob dan tampilan di workflownya")
- [x] Proyek (`projects` + `project_sessions`, migrasi `0005`, hanya tambah tabel; RLS ENABLE + FORCE + `tenant_isolation` di keduanya): nama, alamat situs, catatan, tangkapan layar; dihubungkan ke sesi login yang mengerjakannya
- [x] Penyimpanan berkas `src/shared/storage.ts`: Vercel Blob bila `BLOB_READ_WRITE_TOKEN` ada (web), folder lokal bila tidak (desktop: `<data>/uploads`); di Vercel tanpa Blob unggahan dijawab 503 dengan pesan jelas; gambar dicek dari tanda tangan berkas (JPEG/PNG/WebP), maks. 4 MB; CSP hanya menambah `*.public.blob.vercel-storage.com` untuk gambar
- [x] Pohon per perangkat: proyek tumbuh sebagai **buah** dari sesinya (kartu bertangkapan layar, tangkai kayu), sesudah sesi yang masuk lewat sesi itu; panel sesi menampilkan "Mengerjakan" + "Tambah proyek"; legenda; minimap
- [x] Halaman **Proyek** (`/app/projects`, menu rail): kartu bertangkapan layar, sesi yang mengerjakan, "Lihat di pohon"; form tambah/ubah (unggah/ganti/hapus tangkapan layar, pilih sesi per perangkat dengan pencarian)
- [x] Kepatuhan: ekspor "Data saya" memuat proyek; hapus ruang kerja ikut menghapus berkas tangkapan layar; RoPA: data proyek + tangkapan layar di "Peta sesi login", komponen infrastruktur baru "Vercel Blob" (lokasi diisi operator), profil CLI di "Perangkat", email akun Claude Code di "Ekstensi & Desktop"
- [x] Tes: 92 lulus di 14 berkas terkait (baru: proyek + tangkapan layar + isolasi ruang kerja, penyimpanan, buah di pohon termasuk 40 hutan acak tanpa tumpang tindih, hapus ruang kerja); tsc, lint, build tanpa peringatan; QA visual lokal 9 tangkapan (5 tangkapan layar situs asli dimuat, 0 tumpang tindih, 0 garis lepas, 0 galat, HP 390 px tanpa luber)
- [x] Tangkapan layar 5 situs proyek owner diambil (1440×900, JPEG): Avara, AI Fluencer, Nalar, Sainskerta, Privasimu Knowledge Orbit — disimpan lokal, diunggah ke Blob saat data dicatat
- [x] Izin owner ("migrate dan push", 13 Okt): migrasi `0005` diterapkan di Neon + diverifikasi (6 migrasi; 2 tabel baru RLS ENABLE + FORCE, `tenant_isolation` × 2, hak `akunmu_app` lengkap termasuk sequence, tanpa scope 0 baris; data lama tetap: 3 ruang kerja, 4 pengguna, 5 perangkat, 20 profil, 4 akun, 9 login, 22 temuan); data owner di Laptop Privasimu Acer lewat service app (dicek kering dulu, dijalankan ulang tanpa perubahan): 5 login CLI baru + login Claude Code lama dipindah ke profil CLI-nya, 7 proyek terhubung ke sesinya, 5 tangkapan layar di Vercel Blob (dimuat publik, HTTP 200 `image/jpeg`); push `main` → Vercel
- [ ] `BLOB_READ_WRITE_TOKEN` tersedia di Vercel AkunMu (store Blob terhubung ke proyek) agar unggahan lewat web jalan (owner cek)

---

## Issue & Blocker

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Env (Neon, Blob) belum ada; build lokal tetap jalan dengan PGlite | Medium | ✅ `.env` dari owner (11 Okt 00.40) |
| 2 | Repo GitHub + proyek Vercel untuk AkunMu belum ada | Medium | ⏳ repo GitHub ✅ (11 Okt); proyek Vercel menunggu owner |
| 3 | Tautan unduh desktop mengarah ke rilis GitHub terbaru, yang belum ada | Medium | ✅ rilis `v0.1.0` + 3 aset (11 Okt) |
| 4 | Simpan Pengaturan → AI gagal di produksi (AkunMu & EventMu) | High | ✅ owner mengisi `APP_SECRET` di Vercel AkunMu: "udah kuisi bro aman" (11 Okt) |

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
| 2026-10-11 17:05 | 09 | Owner: "ya, push dan buat rilisnya" → push `cef43ac` (asisten); rilis `v0.1.0` dengan 3 aset desktop; tautan unduh terbaru 302, ukuran cocok; deploy Vercel AkunMu & EventMu sukses |
| 2026-10-11 17:20 | 09 | Ekstensi 0.1.1 di **panel samping** (owner: "di sidebar aja … jangan menggantung … kl lagi copas jadi ilang"), popup hanya cadangan; isu simpan AI ditutup (owner mengisi `APP_SECRET`) |
| 2026-10-11 18:10 | 09 | Owner: "update juga rilis desktopnya biar ekstensinya versi panel" → build desktop ulang (ekstensi 0.1.1 panel samping dibundel), 3 aset rilis `v0.1.0` diganti (nama sama, tautan tetap), catatan rilis diperbarui; ukuran di tautan terbaru = build baru |
| 2026-10-11 18:30 | Repo | Lisensi open source **MIT** (owner: "khusus repo apps ini kasih license opensource, MIT" + "lalu push"): `LICENSE` (© 2026 Galih Praz), `license: MIT` di `package.json` & `desktop/package.json`, bagian Lisensi di README (logo pihak ketiga tetap berlisensi masing-masing) |
| 2026-10-11 18:55 | Repo | Riwayat git ditulis ulang (owner: "bener2 diubah aja"): email & nama profil owner disamarkan di semua commit lama (`progress.md`, `user_requirement.md`), selain itu tidak ada yang berubah (isi commit terakhir, pesan, penulis, tanggal sama); force push `main` + tag `v0.1.0` (rilis & aset tetap); hash commit sejak 11 Okt 07.00 berubah, rujukan hash di dokumen disesuaikan |
| 2026-10-12 18:30 | 10 | Kepatuhan privasi (port dari EventMu, disesuaikan AkunMu): RoPA/DPIA/insiden + unduh PDF/DOCX, permintaan subjek data, persetujuan + halaman legal, data saya (unduh/hapus akun/hapus ruang kerja), retensi + cron, pengaturan bertab; migrasi `0004`; tes + build + QA lokal lulus; commit lokal, menunggu izin "migrate dan push" |
| 2026-10-12 19:30 | 10 | Owner: "migrate dan push" → Neon `0004_compliance` diterapkan + diverifikasi (data lama utuh); push `main` → Vercel |
| 2026-10-13 06:40 | 11 | Profil CLI (banyak akun Claude Code per perangkat) + pindai desktop; tes, build, QA lokal lulus; data Claude Desktop owner dicatat di Neon; commit lokal, menunggu izin push |
| 2026-10-13 07:45 | 12 | Proyek sebagai buah di pohon + tangkapan layar (Blob/lokal), halaman Proyek, migrasi `0005`; tes, build, QA lokal lulus; commit lokal, menunggu izin "migrate dan push" |
| 2026-10-13 11:05 | 11–12 | Owner: "migrate dan push" → Neon `0005_projects` diterapkan + diverifikasi (data lama utuh); 41 profil CLI + data proyek Acer dicatat (5 tangkapan layar di Vercel Blob); push `main` → Vercel |
| 2026-10-13 12:45 | Rilis | Owner: "update juga rilis desktopnya" → desktop dibuild ulang dari `main` (`379db5b`), QA paket (upgrade data rilis lama, pindai Claude Code, tangkapan layar lokal, PDF/DOCX offline, buka ulang), 3 aset rilis `v0.1.0` diganti (nama sama, tautan tetap) + catatan rilis diperbarui; tautan unduh terbaru = build baru |
| 2026-10-13 13:35 | Rilis | Owner: "perbaiki bug secret.json itu, lalu push" → desktop tetap terbuka bila `secret.json` tak terbaca (kunci baru, berkas lama disisihkan, kunci AI dimasukkan ulang); tes unit + uji paket (folder dipindah, buka ulang, instalasi baru); aset rilis `v0.1.0` diganti dengan build `a5f58a6`; push `main` |
| 2026-10-13 14:50 | Rilis | Owner: "naikkan versinya jadi 0.2.0 lalu rilis" → versi 0.2.0 (`f05b83d`), build desktop 0.2.0 + QA upgrade dari data 0.1.0, rilis `v0.2.0` diterbitkan sebagai terbaru (3 berkas, tautan unduh terbaru = 0.2.0); push `main` |
| 2026-10-13 17:25 | Rilis | Owner: "hapus aset lama di rilis v0.1.0" → 3 berkas rilis `v0.1.0` dihapus (rilis + tag tetap), catatannya menunjuk ke rilis terbaru; rilis terbaru tetap `v0.2.0`, tautan unduh terbaru 200 |
