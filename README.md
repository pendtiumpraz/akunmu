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
└─ sign_ins           account × device × (browser profile | app on the device)
```

- One active sign-in per account and place; signing out keeps the row as history.
- A sign-in can name the sign-in of the same account that let it in (`approved_from_id`, with `approval_method`: code, link, QR or prompt); loops are refused. The trees grow from these links and never let two nodes overlap: by device (`src/modules/signins/device-tree.ts`: device → browser profiles, apps and CLIs → providers → sessions, the default view) or by account (`src/modules/signins/tree.ts`: account → the devices it was signed in on directly → the devices it reached from there). Both are pure and tested.
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

## Deployment (Vercel)

Set `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `APP_SECRET` in the project's environment. `vercel-build` runs the migrations, then `next build`.
