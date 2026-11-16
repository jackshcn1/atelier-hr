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
- The daily sync is **hosted on Vercel**, not the office computer. Petpooja blocks
  datacenter IP ranges at the edge with a raw nginx 403, so a GitHub Actions runner
  cannot reach it at all; Vercel (AWS) can. See `memory/petpooja-hosted-sync.md`.
- Entry point: `app/api/sync/route.js`. Scheduler: `.github/workflows/petpooja-sync.yml`,
  daily 23:30 UTC = **05:00 IST**. GitHub Actions only schedules and collects the result.
- The endpoint requires a shared secret (`SYNC_SECRET` on Vercel,
  `VERCEL_SYNC_SECRET` in GitHub). Never widen access to it.
- The run is split into **ten report groups — one report each** — because a full
  sync is longer than a serverless function may run, and two reports per group
  still overran the 300 s ceiling on a slow Petpooja day (HTTP 504).
  `?group=1..10` runs one group (1 captain, 2 pax, 3 item, 4 gstn,
  5 due_payment, 6 executive, 7 kot, 8 wastage, 9 purchase bills,
  10 debit notes); no parameter runs everything, which is the local-computer
  path. The workflow calls the groups one after the other — never in parallel,
  because two Petpooja logins at once break each other.
- The hosted run also **closes finished pay cycles** (locks the cycle and
  freezes its figures into a snapshot), the same as the office-computer
  runner. `scripts/DISABLE-WINDOWS-SCHEDULE.bat` switches the office
  computer's own tasks off — they must not run alongside the hosted one.
- Data is pulled by **browser automation**, not an API: `runPetpoojaSync()` drives
  Chrome via Playwright against `billing.petpooja.com`.
- **A dead browser must never cost the daily sync.** Chromium can die mid-run
  (serverless memory pressure), which shows up as
  `Target page, context or browser has been closed`. The engine therefore creates
  its browser through `openBrowser()` and retries the login on a fresh one, and
  the workflow retries a failed group once after 30 s. A red run always means
  the work did not happen; it is never a false alarm.
- The local computer workflow still works as a manual fallback:
  `node scripts/petpooja-sync.mjs` (headed Chrome). On the desktop it runs every
  report; `SYNC_GROUP=1` runs one group.
- **Petpooja export quirks worth knowing:** the Executive Sales Report is a
  17-sheet workbook (the Order Type table is on Sheet10); the purchase bill list
  is at `inventories/purchase_list/`, not `purchase_invoice_list/`; the inventory
  exports are named-column sheets, so their parsers find columns by header text.
  The `expenses` table has **no** unique index on `(vendor_name, invoice_number)`,
  so bill rows are compared and written individually — never `upsert` with an
  `onConflict` on that pair.
- **Every group must log out of Petpooja.** Closing the browser does not end
  the session: it stays live on Petpooja's side, and the next login is then
  refused — the email field appears but the password field never does. From
  the serverless host each group can come from a different IP, so the account
  collects one dead session per group. Each group ends by visiting
  `billing.petpooja.com/users/logout`. The login error carries a probe (a
  plain fetch of the login page from the same host) so "the site refused us"
  can be told from "the page did not render".
- **Known gaps:** the Google service-account key is not on the server, so the
  Customer Feedback (Google Sheets) sync is inactive in the hosted run — the
  owner chose to leave it off for now; it is skipped gracefully and does not
  fail the run. SMTP is not configured yet, so email alerts are skipped (the
  GitHub workflow-failure notification still fires). `scripts/setup-smtp-alerts.sh`
  turns the email alerts on: it reads the Google app password from a file and
  hands it to Vercel through stdin, so the password never reaches a command
  line.

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
