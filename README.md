# AkunMu

The trees of where your accounts are signed in. Devices (laptops, PCs, phones, tablets) hold browser profiles (Chrome's "Work", Edge's "Personal", …), apps and command-line tools, and each place has accounts signed in to it (Google, Microsoft, GitHub, …). AkunMu draws every account as a tree: the device it was first signed in on (the root), the devices it reached with a code, magic link, QR code or prompt approved there (the branches), and the places it is signed in (the leaves). It answers "where is this account signed in?" and "what is on this laptop?", keeps a list of sign-ins to check, and never stores a password, code or cookie.

Built with the Sainskerta loop-v5 workflow: see `progress.md`, `user_requirement.md`, `architecture-decisions.md`, `audit-report.md`.

## Stack

- Next.js 16 (App Router, Route Handlers) · React 19 · TypeScript 6 (strict) · Tailwind CSS 4
- PostgreSQL (Neon) through Drizzle ORM; the driver lives only in `src/shared/db`
- AI assistant through the provider gateway in `src/modules/ai` (Anthropic Messages or OpenAI-compatible)
- Vitest + PGlite (in-memory PostgreSQL with row level security) for tests

## Getting started

```bash
npm install
cp .env.example .env          # fill DATABASE_URL, DATABASE_URL_UNPOOLED, APP_SECRET
npm run db:migrate            # apply drizzle/migrations (tables, then row level security)
cp bootstrap.example.json bootstrap.json   # platform owner + first workspace (bootstrap.json is gitignored)
npm run platform:bootstrap    # prints generated passwords once
npm run dev                   # http://localhost:3000, sign in at /login
```

`APP_SECRET` must be a random string of at least 32 characters; it encrypts stored AI keys:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

More accounts: `npm run user:create -- --tenant <slug> --email … --name "…" --role admin|editor|viewer`, or `--platform` for the owner console. People can also create their own workspace at `/signup`.

## Data model

```
tenants (workspaces)
├─ users              admin · editor · viewer
├─ devices            laptop, PC, phone, tablet
│   └─ browser_profiles   one per browser profile on that device
├─ providers          26 built in (Google, Microsoft, GitHub, …) plus the workspace's own
│   └─ accounts           provider + identifier (email, username or phone)
├─ sign_ins           account × device × (browser profile | app on the device)
├─ ingest_tokens      one browser-extension key per device (only its hash is kept)
└─ findings           what the extension or AkunMu Desktop saw that the trees lack, waiting for yes or no
```

- One active sign-in per account and place; signing out keeps the row as history.
- A sign-in can name the sign-in of the same account that let it in (`approved_from_id`, with `approval_method`: code, link, QR or prompt); loops are refused. The trees grow from these links and never let two nodes overlap: by device (`src/modules/signins/device-tree.ts`: device → browser profiles, apps and CLIs → providers → logins, each with the sessions it let in hanging off it, on whichever device they are; the default view) or by account (`src/modules/signins/tree.ts`: account → the devices it was signed in on directly → the devices it reached from there). Both are pure and tested.
- A sign-in not confirmed for 30 days, or marked for review, shows under "To check".
- Deleting a device trashes its profiles and sign-ins with the same timestamp; restoring brings them back together. The same goes for accounts and their sign-ins.
- Free text (notes, labels) that looks like a secret (API keys, tokens, private keys, backup codes) is refused.

## Multi-tenancy and row level security

Every workspace-owned table has a `tenant_id`, and isolation is enforced by **PostgreSQL row level security** (migration `0001_rls`), not only by application code. Each statement runs in a short transaction that switches to the role `akunmu_app` (no RLS bypass) and sets `app.tenant_id` / `app.platform` (`src/shared/db/scope.ts`); the settings are transaction-local, so they never leak through Neon's pooler. Without a scope no workspace rows are visible.

## AI assistant

`/app/assistant` answers with read tools (`find_account`, `list_devices`, `get_device`, `list_accounts`, `list_providers`, `get_overview`) and proposes changes with action tools (`add_device`, `add_browser_profile`, `add_provider`, `record_sign_ins`, `sign_out`, `confirm_sign_ins`, `mark_for_review`, `update_account`). A change runs only after the person confirms its card; the assistant cannot delete anything. Tools follow the role's permissions. Passwords typed into the chat are masked before anything reaches the AI provider.

The platform owner sets AkunMu's AI providers and monthly quotas at `/platform/ai`; a workspace admin can switch to its own key at `/app/settings`.

## Credits

- Browser logos: [alrra/browser-logos](https://github.com/alrra/browser-logos) (MIT); the Arc glyph and provider glyphs: [Simple Icons](https://simpleicons.org) (CC0). All served from `public/brands`; the marks belong to their owners and only name the browser or provider.
- The account trees canvas: [React Flow](https://reactflow.dev) (MIT). Landing motion: [GSAP](https://gsap.com) (standard no-charge license).

## Languages

Code is English only (guarded by `tests/unit/code-language.test.ts`). Every user-facing text lives in `src/shared/i18n/messages/<code>.json` (`id` and `en`). A new language is one file plus one entry in `src/shared/i18n/locales.ts`; missing keys fall back to English.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` · `lint` · `test` | `tsc`, ESLint, Vitest |
| `npm run db:generate` | New migration from the schema files |
| `npm run db:migrate` | Apply migrations (also part of `vercel-build`) |
| `npm run platform:bootstrap` | Platform owner + workspaces from `bootstrap.json` |
| `npm run user:create` | One more staff account |
| `npm run extension:pack` | Zip `extension/` into `public/downloads/akunmu-extension.zip` (also runs before `dev` and every build) |

## Deployment (Vercel)

Set `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `APP_SECRET` in the project's environment. `vercel-build` runs the migrations, then `next build`.

## Download & connect

`/app/connect` (menu "Connect") offers the downloads, the browser extension's keys, the findings to accept or dismiss, and the full setup steps.

- **Browser extension** (`extension/`, Manifest V3, English and Indonesian). Loaded by hand: unzip, open `chrome://extensions`, turn on Developer mode, Load unpacked. The toolbar button opens it in the browser's side panel, which stays open while you copy from another tab (a popup in browsers without a side panel). There it takes an address and a key (one key per device, made on the Connect page and shown once), and the profile's name. Every 6 hours, on browser start when overdue, and on "Check now", it looks at the workspace's providers in this browser profile (`extension/lib/sites.js`): which sites have a sign-in cookie, and the account name where the site states it (the Google accounts list, GitHub's user cookie). It sends only domains and account names to `/api/ingest/report`, never cookie values, passwords or page content. "Also look for other sites" adds any other site whose cookie names mean "signed in".
- **Findings.** What the trees lack becomes a finding (`src/modules/connect`). Accepting one records the device, profile, provider, account and sign-in through the usual services. A recorded sign-in seen again is confirmed. One on a site the extension checked with a reliable rule but did not see is marked for review; nothing is ever signed out by an agent.
- **Open in profile.** A sign-in in a Chromium browser profile, on a device with a computer name, can be opened at its provider's site in that profile. In the desktop app this runs the browser with `--profile-directory`. On the web it hands an `akunmu://open?…` link to AkunMu Desktop on that computer, which opens the profile only if the link names this computer.

## Desktop app (Windows and Linux)

`desktop/` packages the same app as a Windows and Linux program that works offline, with its own database on the computer. It shares nothing with the web version.

- **How it runs.** The Electron shell (`desktop/src/main.ts`) starts two processes:
  - the database (`desktop/src/db-host.ts`): PGlite, which is PostgreSQL in WebAssembly, migrated with `drizzle/migrations` on every start;
  - the app's Next.js standalone server, on free ports at `127.0.0.1`.

  It then opens a window on the app with a key made for that launch, so nobody signs in. The first launch creates an empty workspace and two default people (`src/modules/desktop`):
  - the user (`user@akunmu.local`, admin of the workspace), which the app opens as;
  - the superadmin (`superadmin@akunmu.local`, the platform console).

  The user menu switches between these two modes (`src/app/desktop/mode`).
- **Data.** Everything lives in `%APPDATA%\AkunMu`:
  - `database\`: back this folder up while AkunMu is closed;
  - `secret.json`: the key that encrypts stored AI keys, itself protected by Windows (DPAPI);
  - `logs\akunmu.log`.

  Uninstalling keeps this folder. `AKUNMU_DATA_DIR` points the app at another folder (such a run leaves `akunmu://` links to the installed app). On Linux the folder is `~/.config/AkunMu`.
- **This computer.** The Connect page knows the computer by its name, scans its Chrome, Edge, Brave and Vivaldi profiles (their `Local State` file; new ones become findings) and opens any of them in one click.
- **For the browser extension.** The shell opens a fixed port, `http://127.0.0.1:47821` (or the next free one up to 47825), that forwards only `/api/ingest/*` to the app, so the extension can report to the desktop app as it does to the web. The desktop app also tells the extension the computer's name, which the extension then reports to the web too.
- **`akunmu://` links.** The app registers itself for them on start (on Linux it writes its own menu entry, `~/.local/share/applications/akunmu.desktop`). "Open in profile" on the web uses them.
- **AI.** Works as on the web: either the superadmin adds providers under Platform → AI, or the user adds their own key under Settings → AI.
- **Build.** From `desktop/`:
  1. Run `npm install`, then `node node_modules/electron/install.js` once.
  2. Run `node scripts/build.mjs`.

  The script packs the browser extension, runs `next build` with `AKUNMU_DESKTOP=1` into `.next-desktop` and stages it in `desktop/app`. It stops if any `.env` file or `.env` value would ship. It then writes `AkunMu-Setup-x64.exe`, `AkunMu-win-x64.zip` and `AkunMu-linux-x64.tar.gz` to `desktop/release/`. The program is not code-signed yet, so Windows SmartScreen asks for confirmation on the first run.
- **Releases.** The download links point at the latest release of `pendtiumpraz/akunmu` on GitHub (`releases/latest/download/<asset>`); the asset names carry no version so the links never change. There is no macOS build yet.
