# Progress — AkunMu

> Source of truth progress project (loop-v5). Diperbarui setiap perubahan status.

---

## Ringkasan

| Item | Status |
|------|--------|
| **Project** | `akunmu` |
| **Fase Aktif** | `Fase 00: Prerequisites` |
| **Status Loop** | `queued` — mulai setelah modul rekap EventMu live |
| **Dimulai** | `2026-10-11 00:15` |
| **Target Selesai** | — |
| **Progress** | 0% (folder, loop-v5, requirement) |

---

## Fase

### 🔄 Fase 00: Prerequisites
- [x] Folder `D:/AI/privasimu/device`, repo git `main`
- [x] Salinan `loop-v5` (sama dengan EventMu, termasuk aturan #12 bahasa kode)
- [x] Requirement owner dicatat verbatim (`user_requirement.md`)
- [x] Database credentials (Neon pooled + unpooled) di `.env` (owner, 11 Okt 00.40; di-gitignore, nilai tidak dicetak)
- [x] Storage credentials (Vercel Blob) di `.env`
- [x] Target deploy: Vercel (owner: "nanti juga bakal di deploy ke vercel")
- [ ] `APP_SECRET` untuk Vercel (dibuat saat Fase 03, dipasang owner di Vercel)
### ⏳ Fase 01: Planning
- [ ] Analisa requirement + model data (perangkat → profil browser → akun login; penyedia; akun lintas profil)
- [ ] Keputusan arsitektur (`architecture-decisions.md`): stack sama EventMu, UI berbeda
### ⏳ Fase 02: Wireframe & Audit
- [ ] Arah visual baru (berbeda dari EventMu) + wireframe
### ⏳ Fase 03: Backend · ⏳ Fase 04: Frontend · ⏳ Fase 05: Audit · ⏳ Fase 06: Deployment

---

## Issue & Blocker

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Env (Neon, Blob) belum ada; build lokal tetap jalan dengan PGlite | Medium | ✅ `.env` dari owner (11 Okt 00.40) |

---

## Log Perubahan

| Waktu | Fase | Catatan |
|---|---|---|
| 2026-10-11 00:20 | 00 | Kickoff: folder, loop-v5, requirement; antre setelah modul rekap EventMu |
