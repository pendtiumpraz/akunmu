# User Requirement — AkunMu

> Tempat kebutuhan, feedback, dan approval antara owner dan AI developer (loop-v5).
> Bahasa dokumen: Indonesia (komunikasi). Kode aplikasi: Inggris (aturan #12).

---

## 📋 Requirement Project

### Nama Project
`akunmu` — **AkunMu** (usulan AI; owner: "Device Management Account atau terserah kamu kasih nama apa deh suka2 kamu"). Saudara EventMu.

### Deskripsi Singkat
Aplikasi Next.js untuk mencatat **di perangkat dan profil browser mana setiap akun sedang login**, supaya owner yang punya banyak akun (terutama Google) dan jarang logout tetap tahu jejak loginnya.

Struktur: **Perangkat → Profil browser → Akun yang login (penyedia + akun)**. Contoh owner:
- Device A → Chrome profile A → provider A, akun A
- Device A → Chrome profile B → provider A, akun B
- Device C → Chrome profile B → provider D, akun D

Nama profil yang sama bisa muncul di beberapa perangkat; satu akun bisa login di banyak tempat.

### Target Pengguna
- Owner (pemakai pribadi dengan banyak akun dan perangkat).
- Arsitektur tetap SaaS seperti EventMu (tenant + RLS), sehingga bisa dipakai orang/tim lain.

### Deadline
Tidak ditentukan.

---

## 🎯 Fitur Utama (dari pesan owner, dirinci AI)

1. **Peta login** (High): perangkat, profil browser per perangkat, akun yang login di tiap profil, penyedia akun.
2. **Cari dua arah** (High): "akun X login di mana saja?" dan "di perangkat/profil ini login akun apa saja?".
3. **Tanpa rahasia** (High): tidak ada password, token, atau kode pemulihan yang disimpan; hanya catatan lokasi login.
4. **Asisten AI** (High): perilaku agentic sama persis dengan EventMu (tool calling sesuai izin, perubahan hanya jalan setelah dikonfirmasi di kartu, gateway multi-penyedia, kuota bulanan, BYOK).
5. **Bahasa** (High): kode 100% Inggris; aplikasi `id` + `en`; bahasa baru = 1 file + 1 entri registry.
6. **Tampilan berbeda** (High): UI **harus beda** dari EventMu (bukan gaya poster paper/coal/marker).

---

## ⚙️ Teknologi

Sama persis dengan EventMu (owner: "technya sama persis seperti event"):
- Next.js (App Router) + React + TypeScript strict + Tailwind v4.
- PostgreSQL (Neon) + Drizzle ORM + RLS per tenant; Vercel Blob; deploy Vercel.
- Tes PGlite + Vitest, lint ESLint, typecheck `tsc`.
- Env dikirim owner nanti ("aku bakal kirim envnya nanti").

---

## 💬 Pesan owner (verbatim)

> Catatan (11 Okt): alamat email dan nama profil browser owner di kutipan bawah ini disamarkan (`[email …]`, `[… profil]`) atas permintaan owner, karena repo ini publik.

**2026-10-11 00:15 WIB**
> oke sekarang setelah bikin event tadi aku mau bikin serupa untuk device management account, Device A, chrome profile A, isinya profider A akun A, chrome porofile B isinya profider A akun B, lalu device C chrome profile B isinya profider D akun D, gitu2 paham gak?? dan aku mau buat ini di D:/AI/privasimu/device jadi ini juga nextjs aku bakal kirim envnya nanti, intinya sama basisnya clone dulu loop v5 tadi kayak yang di folder event, harus ada juga di folder device ini untuk loop-v5 sainskerta, dan perilaku agenticnya harus sama persis bro! bedanya ini device & account management gitu, biar aku gak lupa karena aku punya banyak account google juga, cuma biar tahu aku login akun2 itu dimana gitu karena jarang logout, dan karena aku pakai agentic nama appsnya adalah Device Management Account atau terserah kamu kasih nama apa deh suka2 kamu, technya sama persis seperti event

**2026-10-11 00:18 WIB**
> tapi tolong UI nya harus beda!

**2026-10-11 07:00 WIB**
> migrate neon , ku buatkan githubnya

**2026-10-11 07:20 WIB**
> iya pakai [email owner], ruang kerjanya Pribadi

**2026-10-11 07:40 WIB**
> loginnya apa di akunmu itu? ada [email 1] ada [email 2] ada [email 3] harusnya 3 tenant berbeda, [email 1] superadmin

**2026-10-11 08:10 WIB**
> jadi gini bro! aku kan ini untuk di device itu untuk melihat sesi login yaa, lalu aku udah pasang, device A, profile browser A, lalu akun provider, dan akunnya, nanti perlu aku tulis digunakan di laptop mana, apakah di device yang sama apa beda, nyatanya aku login dari device A di browsernya, tapi CLI nya login pakai magnet link minta code dari device itu loginnya di device lain, gitu? aku mau ada peta penambahan device dari akun2 provider itu, untuk tracking aja, dan aku mau ya setiap browser profile itu pakai icon2 / logo browser sebenarnya, dan juga untuk device - akun - dipakai di ini nanti jadi tree gitu kelihatan graph nya bisa gak yah??? aku pengen punya tampilan UI tree kayak comfy UI itu tapi bener2 kelihatan pohonnya, dan gak boleh saling tabrakk gitu

**2026-10-11 08:20 WIB**
> dan tolong UI nya lebih kreatif bisa gak, di landing page kasih screenshot screenshot gitu, tapi tolong perbaiki dulu UI dashboardnya soalnya aku gak mau yang terlalu standar kamu boleh pake micro interaction, gsap dll untuk landing pagenya, kalau perlu ada motion kasih aja motion motion boleh kok

**2026-10-11 08:25 WIB**
> ya temanya adalah pohon gitu, kita ngelihat akar akunnya dari device mana, dipakai di dahan & daun device mana gitu

**2026-10-11 09:20 WIB**
> migrate dan push

**2026-10-11 09:30 WIB**
> background hero nya masih kurang proper ya penempatan dot nya? kayaknya? coba cek gambaran treenya garis2nya kurang match

**2026-10-11 09:35 WIB**
> maksudku gini aku mau ada penambahan dimana misal claude.ai itu aku login akun info@esteh.id di PC #1, tapi claude-clinya login info@esteh.id adalah laptop ASUS gitu, kan juga bisa multi session, aku mau cek ini juga bisa di multi login claude-cli laptop acer misal, aku mau lihat sessi yang aktifnya ini lho maksudku, paham gak?, jadi bukan hanya riwayat login, tapi juga login session ada dimana saja, kan bercabang, kayak 1 akun googleku bisa login di banyak device, begitu juga claude yang udah login di 1 device, bisa di autorize dipakai di claude cli device lain aku mau ini tercatat

**2026-10-11 09:40 WIB**
> dann di UI pohon, 1 device itu 1 tree, dan chrome profile ada di cabang, profider ada di ranting, sedangkan daunya adalah login session di device mana keterangannya, gitu

**2026-10-11 (setelah push `a7923d0`)**
> harusnya treenya dari claude.ai nyambung ke banyak claude code / claude cli di keterangan device mana gitu karena multi session, bukan berhenti di claude code lalu tree device lain buka claude code langsung,

**2026-10-11 (setelah push `6dd96a7`)**
> untuk yang akunmu bisa buatkan versi desktop exenya kah? kayaknya menarik pakai sqlite kan yaa dekstopnya??

Pilihan owner atas usulan AI: database desktop **PGlite** (Postgres tertanam; skema, migrasi, dan RLS dipakai apa adanya) — bukan SQLite; data desktop **terpisah dan offline** (tidak sinkron dengan versi web).

**2026-10-11 (sore)**
> untuk eventmu dan akunmu tolong tambahkan favicon ya

> buat penyedia / provider yang di connect itu bisa ditambahkan selain milik kita, yang pilih penyedia itu, dan tolong jadikan dropdown select search, ada + tambah provider di paling bawah select, dan keluar modal untuk tambah profider gitu?
> atau keluar field baru tambah profider?
> lebih masuk akal kalau cukup keluar field baru penambahan profider?

> bantu saya menambahkan di [akun] pribadi, di PC #1 ada chrome session [3 profil] (ini udah ada), tambahkan profile chrome, [3 profil], lalu di laptop privasimu acer tambahkan chrome profile [2 profil], lalu tambahkan di asus laptop profile chrome, [11 profil]

> yg local kosongkan dulu jangan ada user, cuma ada default superadmin dan default user aja gpp
> kasih mode doang aja di local gak usah login kan??
> yang dekstop maksudku gak perlu login kan?

> aku simpan ini malah terjadi kesalahan [Pengaturan → AI, BYOK Anthropic, Simpan]
> di eventmu dan di akunmu masih error semua kayaknya
> coba cek

**2026-10-11 (sore, Fase 09)**
> bisa gak sih ada chrome extension yang dipakai sweep chrome profile dan devicenya?? dan masuk ke akun yang terhubung gitu2? jadi chrome extension konek ke platform pake ingest token, dan juga chrome extension bisa connect ke desktop untuk cek semua profider yg terhubung dan emailnya? gitu?? sehingga nanti ketika di klik dari platform atau dari desktop app, platform tertentu ketika di klik langsung dibuka dari chrome profilenya gitu? bisa gak yah?

> dan masukkan aja di halaman download & connect di account masing2 tenantnya

Pilihan owner atas usulan AI: **semua sekaligus**; yang ditemukan menjadi **saran yang disetujui** (login yang sudah tercatat dikonfirmasi otomatis); ekstensi dibagikan sebagai **zip yang dipasang manual**.

> dan di landing page kasih button download .exe windows, dan untuk app linuxnya dan macnya kalau ada, kalau gak ada cukup windows dan linux juga

> tolong extensionnya di sidebar aja ya 1/4 gitu, jangan menggantung kek sekarang, kl lagi copas jadi ilang soalnya

> update juga rilis desktopnya biar ekstensinya versi panel

> khusus repo apps ini kasih license opensource, MIT
> lalu push

> gas lagi cek apa yang bisa di tambah di eventmu dan akunmu! apapun! consent, DSR, dan apapun semua harusnya masalah privacy PP & UU PDP pastikan udah comply, kamu bisa buat full ropa nya di superadmin / admin nya complete ropa dan DPIA nya based on apa yang ada di backend dan frontend tuh ada format ropa & DPIA, dan harus bisa di download per activity untuk ropa, dan per dpia jadi pdf dan docx, dan setelah ini semua fitur yg kurang di settingsnya bisa ditambahi, dan settings harus ber tab tab aja biar mudah UI nya jangan scroll kebawah

---

## ✅ Approval & Feedback

| Waktu | Gerbang / Topik | Keputusan owner |
|---|---|---|
| 2026-10-11 00:15 | 00–01 Kickoff | Instruksi build langsung (stack sama EventMu, loop-v5, agentic sama persis) |
| 2026-10-11 00:18 | UI | Harus beda dari EventMu |
| 2026-10-11 | Fase 08 Desktop | Versi `.exe`: PGlite (bukan SQLite), data terpisah & offline |
| 2026-10-11 | Fase 09 Unduh & hubungkan | Semua sekaligus; temuan = saran yang disetujui; ekstensi zip dipasang manual; landing: Windows + Linux (macOS belum ada) |
| 2026-10-12 | Fase 10 Kepatuhan privasi | Lengkapi kepatuhan UU PDP & PP 33/2026 (consent, DSR, dll.); RoPA + DPIA lengkap di admin & superadmin dengan unduh PDF + DOCX per aktivitas/DPIA; tambah fitur pengaturan yang kurang; pengaturan bertab tanpa gulir |
| 2026-10-12 19:25 | Fase 10 deploy | "migrate dan push" (Neon `0004` + push `main`) |
