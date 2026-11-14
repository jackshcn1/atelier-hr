# AGENTS.md — Atelier HR / ERP

Project instruction file for MiniMax Code (replaces the Claude Code `CLAUDE.md` workflow).
Read this file before working on anything in this repo.

**What this is:** An all-in-one HR administration, operations, and payroll platform for
restaurant Atelier. Live production app with real employee records and real money.

**Canonical working copy:** this folder (`MiniMax Projects/Atelier ERP`).
The previous Claude Code copy at `~/Documents/Claude Code Projects/Atelier ERP` is a
read-only backup of the transfer — do not edit there.

---

## Hard Rules (never break these)

1. **Never expose the Supabase service-role key.** Keep `SUPABASE_SERVICE_ROLE_KEY` in
   `.env.local` / `env.local` only. Never print its value in chat, commit it, paste it into
   a client-side file, or echo it into logs. `env.local`, `.env.local`, and
   `memory/maintenance-module-status.md` are gitignored for this reason.
2. **Consult the user before changing payroll or variable-pay formulas.** Any change to
   per-day salary, salary split, effective-days, weekly-off loss, or metric attainment
   math requires explicit approval first. See `memory/payroll-business-logic.md`,
   `memory/salary-split-logic.md`, `memory/variable-pay-engine.md`.
3. **Back up the database before schema changes** (column renames, drops, type changes).
   Verify Row Level Security policies after any schema change touching employee or
   sensitive data.
4. **One feature or fix per branch.** Never bundle unrelated changes. Never work directly
   on `main` — create a branch, then open a pull request.
5. **Explain everything in plain English.** The user is a restaurant owner with no coding
   background. Spell out technical terms on first use. Every change summary must cover:
   what changed, what it affects, what could break, and how to undo it.

---

## Working Method

- **Plan before code.** For anything non-trivial, present a plan and get approval before
  writing code.
- **Verify before claiming done.** Evidence over assertions. Check `GATES.md` at session
  start — it tracks outstanding verification gates, and two gates are still open.
- **Browser-verify the live front-end** at `https://atelier-hr-inky.vercel.app` before
  reporting UI work complete. Vercel deploys fail silently on build errors — check the
  Vercel build log, not just the deploy status.
- **Database access is self-serve.** Do not ask the user to paste SQL into the
  Supabase Dashboard SQL Editor. See "Database & Deploy Access" below.
- `lib/supabaseClient.js` is browser-only (`createBrowserClient`). Never import it in a
  server route — server routes build their own client with `global.headers.Authorization`
  so RLS applies to the logged-in user.
- Never import depth shortcuts: deep routes need `../../../../lib/supabaseClient`.

---

## Database & Deploy Access

All four connections are live and verified. Re-verify with
`node scripts/verify-supabase-setup.mjs`.

### Supabase — run SQL directly, no Dashboard required
- Project `wzxswmopfxnucmeygqeg` (Atelier HRMS), linked via `supabase link`.
- **Migrations:** write a file in `supabase/migrations/`, then `supabase db push`.
  The ledger is in sync (54 local = 54 remote) and push reports "up to date".
- **One-off SQL:** `exec_sql` / `exec_sql_select` RPCs exist, callable with the
  service_role key. They run as `postgres`. `anon` and `authenticated` are revoked
  and confirmed rejected — never widen those grants.
- **Before any schema change:** `node scripts/backup-db.mjs` writes a schema + data
  dump to `.backups/`. It needs `.supabase-access-token` (Supabase CLI access token,
  gitignored). Extract with:
  `security find-generic-password -s "Supabase CLI" -a "supabase" -w > .supabase-access-token`
- **Check migration state before touching schema:**
  `node scripts/check-migration-state.mjs` reports, per migration, which objects
  already exist on the live database.
- If ledger and reality drift again, reconcile with
  `supabase migration repair --status applied <version>` — only for migrations
  verified as applied, and only after a backup.

### Vercel
- CLI logged in; project `atelier-hrms/atelier-hr`, linked in `.vercel/project.json`.
- Pushing to GitHub `main` auto-deploys to `https://atelier-hr-inky.vercel.app`.
- Deploys fail **silently** on build errors — check the Vercel build log, not just status.
- `vercel ls` lists deployment history (watch for `● Error` rows).

### Git
- `gh` is authenticated as `jackshcn1` and is the credential helper.
- Repo identity is set repo-scoped: `jackshcn1 <rishvin787@gmail.com>`.
- Remote: `github.com/jackshcn1/atelier-hr`. Branch per feature, never commit to main.

### Petpooja
- Attendance/sales data is pulled by **browser automation**, not an API:
  `node scripts/petpooja-sync.mjs` drives Chrome via Playwright against
  `billing.petpooja.com`. It runs headed (`PETPOOJA_HEADLESS=false`) because
  Petpooja challenges headless browsers.
- Credentials live in `scripts/petpooja-config.json` (gitignored).
- **Known gap:** `GOOGLE_PRIVATE_KEY_PATH` in that config points at a Windows path
  (`C:\Users\LENOVO\...`). The Google service-account key is not on this machine, so
  the Customer Feedback (Google Sheets) sync is inactive until the key is provided.
- SMTP is not configured, so email alerts are silently skipped.

---

## Reference Map

| Topic | File |
|---|---|
| Architecture, routes, design system, key files | `CLAUDE.md` |
| Full system context (payroll, salary split, variable pay, security) | `atelier_hr_context.md` |
| User profile & working preferences | `memory/user-profile.md`, `memory/workflow-preferences.md` |
| Tech stack | `memory/tech-stack-atelier.md` |
| Project status & module inventory | `memory/project-atelier-hr.md` |
| Payroll rules | `memory/payroll-business-logic.md` |
| Salary split rules | `memory/salary-split-logic.md` |
| Variable pay engine | `memory/variable-pay-engine.md` |
| Maintenance module | `memory/maintenance-module-status.md`, `memory/maintenance-module-framework.md` |
| Operations asset record | `memory/operations-assets-full-record.md` |
| Open verification gates | `GATES.md` |
| Last session context | `SESSION_CONTINUE.md` |
| Migration / handover notes | `MIGRATION_HANDOVER.md`, `MAINTENANCE-REFERENCE.md` |

Memory index: `memory/MEMORY.md`.

---

## Key Commands

- `npm run dev` — local dev server
- `npm run build` / `npm run start` — production build / serve
- `node scripts/petpooja-sync.mjs` — Petpooja variable-pay sync (runs on the office computer)
- `node scripts/setup-petpooja.mjs` — one-time Petpooja credential setup

## Deploy Flow

Code is pushed to GitHub (`jackshcn1/atelier-hr`); Vercel auto-deploys `main` to
`https://atelier-hr-inky.vercel.app`. Branches get preview links.
