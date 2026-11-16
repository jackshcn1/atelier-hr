---
name: petpooja-hosted-sync
description: "How the Petpooja daily sync is hosted (Vercel), why it cannot run on a GitHub runner, and the constraints that must not be broken."
metadata:
  node_type: memory
  type: project
  modified: 2026-11-15T03:00:00.000Z
---

# Petpooja Hosted Sync (replaces the local-computer job)

## The constraint that shapes everything

**Petpooja blocks datacenter IP ranges at the nginx edge with a raw `403 Forbidden`
(default nginx error page, no application involvement).** Verified from both sides:

| Caller | Egress | Result |
|---|---|---|
| GitHub Actions runner | Azure | `403 Forbidden` — plain fetch, desktop UA and real Chrome all identical |
| Vercel function | AWS | `200 OK`, login form present, report data renders |

No User-Agent, header or stealth tweak can bypass it — the request never reaches
Petpooja's application. So **the browser work must run from an IP Petpooja accepts**,
which in practice means Vercel (already hosting the app, free tier).

The old comment in `scripts/petpooja-sync.mjs` ("Runs LOCALLY on the office computer
(Petpooja blocks cloud/datacenter IPs)") was correct and is now the reason for the
architecture, not an obstacle to it.

## Architecture

- `app/api/sync/route.js` — the sync entry point. Runs a serverless Chromium
  (`@sparticuz/chromium` + `playwright-core`), then calls the existing
  `runPetpoojaSync()`.
- `.github/workflows/petpooja-sync.yml` — the scheduler only. It POSTs to the
  endpoint and collects the result. Daily at **23:30 UTC = 05:00 IST**
  (`cron: '30 23 * * *'`; GitHub cron is always UTC).
- Auth: the endpoint requires a shared secret, accepted as either
  `Authorization: Bearer <SYNC_SECRET>` (what Vercel Cron sends) or
  `x-sync-secret: <SYNC_SECRET>`. `anon` and `authenticated` are not relevant here —
  this is a machine-to-machine endpoint, so it must never be callable without the secret.
- Secrets live in two places: Vercel project env (`SYNC_SECRET`, `PETPOOJA_*`,
  `SUPABASE_SERVICE_ROLE_KEY`) and GitHub Actions secrets (`VERCEL_SYNC_URL`,
  `VERCEL_SYNC_SECRET`). Both must exist or the job fails silently.

## Report groups (the 300 s ceiling)

A full sync runs **240–285 s**, right against Vercel Hobby's `maxDuration: 300`,
and the first hosted attempt died with `FUNCTION_INVOCATION_TIMEOUT`. So the
reports are split into six groups and the workflow calls them one after the
other (never in parallel — they write the same metric rows):

| Group | Reports | Measured |
|---|---|---|
| 1 | `captain`, `pax` | ~110 s |
| 2 | `item` (8.4 MB Item Report) | ~75 s |
| 3 | `gstn`, `due_payment` | ~128 s |
| 4 | `executive`, `kot` (KOT needs the Base Menu too) | ~146 s |
| 5 | `inventory` (wastage), `purchase_invoices` | ~143 s |
| 6 | `purchase_returns` (debit notes) | ~109 s |

**The groups are sized for a slow day, not a fast one.** Petpooja's pages can
take twice as long to load; a group that fits on a good day but not on a bad
one fails the whole nightly run. An earlier four-group layout put gstn +
due_payment + executive + kot together, which measured 188 s on a fast day and
went past 300 s on a slow day.

- `?group=1|2|3|4|5|6` selects one group; `?reports=a,b` selects an explicit
  set; **no parameter runs everything** — that is the local-computer path and
  it is unchanged.
- `SYNC_GROUP` / `SYNC_REPORTS` (env) are the underlying switches, read by
  `reportEnabled()` in `scripts/petpooja-sync.mjs`.
- The Google Sheets customer-feedback pull is not a Petpooja report but writes
  to the same metric rows, so `feedbackEnabled()` runs it **once only, in the
  last group**.
- The serverless runner is slower than the desktop, so report downloads get a
  longer timeout via `PETPOOJA_DOWNLOAD_TIMEOUT` (120000 ms on Vercel; 35 s
  locally).
- Each report download logs how long it took, so a slow day is visible in the
  log rather than showing up as a timeout.

**Petpooja is slower than you think on a bad day.** Three report steps had to
be made patient:
- the page is now **waited for** before it is used — it must have its date
  fields before the export button is looked for, because a page exported
  without a date filter covers the wrong period, not just no report at all.
  The page is reloaded once if it never becomes usable.
- the Excel/Export button is looked for over 30 s instead of once.
- the billing dashboard that mints the inventory session is loaded with
  `domcontentloaded` and retried three times.

## A green run must mean the work happened

The first version of the workflow assigned the group list to a shell variable
called `GROUPS` — which is a **Bash built-in array** holding the current user's
group ids, so the assignment was silently ignored. On the GitHub runner
`$GROUPS` expanded to `1001`, the workflow requested report group "1001", the
engine matched no reports, ran nothing, and still answered HTTP 200. The daily
job reported success every morning while fetching nothing.

Three layers now stop that class of failure:

1. The endpoint rejects an unknown group or report name with **400**.
2. The engine refuses an unknown `SYNC_GROUP` / `SYNC_REPORTS` value.
3. The workflow fails the job when a group reports "ok" but fetched no
   reports, completed only some of them, or refused to write a metric.

## A dead browser must not cost the day

On 16 Nov the hosted run failed at **group 5** with:

```
HTTP 500  {"ok":false,"error":"page.waitForTimeout: Target page, context or browser has been closed"}
```

Chromium had died about 15 seconds after the login submit. Groups 1-4 and 6 were
fine, so it was a dead browser, not a broken report — but one dead browser lost
the whole daily sync.

Two layers now absorb it:

1. The engine creates its browser, context and page through `openBrowser()`, so
   a dead session can be replaced. The login is retried up to three times, each
   retry on a fresh browser after a 10 s pause.
2. The workflow retries a failed group once after 30 s, and pauses 10 s between
   groups so Petpooja never sees two logins at once.

The lesson is the same as the `GROUPS` bug above: **a failure that is only
sometimes real must be retried, and a success must be proven, not assumed.**

## Two syncs must never overlap

Petpooja refuses a second login while another session is active: the second
run gets the login page's email step but never the password field, and fails
with `locator.waitFor: Timeout 20000ms exceeded` on
`#UserPassword`. This is easy to trigger by hand — cancelling a local `curl`
does **not** stop the server-side function, which keeps running for its full
300 s. GitHub's `concurrency: petpooja-sync` group stops two *workflow runs*
from overlapping, but nothing stops a manual endpoint call from racing the
schedule. Let a previous call finish before starting another.

## Console capture

The endpoint tees the sync engine's `console.log` output into its JSON
response so a scheduled run's summary shows which reports were fetched. The
patch is applied **once at module scope**, not per request: a serverless
instance can serve two requests at once, and a per-request patch lets the
second request hijack the first one's capture.

## Constraints that must not be broken

1. **`middleware.js` gates every path to `/login`.** `/api/sync` is excluded with an
   **anchored** matcher (`api/sync$`) — the anchor matters, because
   `/api/sync-petpooja` (the browser 1-click sync) must stay behind the session gate.
   Without the exclusion the cron can never reach the endpoint.
2. **`next.config.js` must keep `serverComponentsExternalPackages` for
   `playwright-core` and `@sparticuz/chromium`.** `playwright-core` 1.63.0 lazily
   requires `chromium-bidi` without declaring it as a dependency, so webpack cannot
   resolve it. `@sparticuz/chromium` reads its `.br` browser archives from
   `node_modules/@sparticuz/chromium/bin/` at runtime.
3. **`outputFileTracingIncludes` must copy the `.br` archives into the function
   bundle** and **`outputFileTracingExcludes` must keep
   `scripts/petpooja-config.json` out of the deployment.** Without the exclude, the
   local credential file (Petpooja + Supabase keys) is traced into the function
   bundle and shipped to Vercel.
4. In Next 14 these two options live under `experimental`, not at the top level.
   The route glob key is `/app/api/sync` (Next does not strip the `app` segment).
5. **`scripts/petpooja-sync.mjs` auto-runs only when its own basename is the CLI
   entry** (exact match, not `endsWith`), so importing it from the bundled route
   can never trigger an auto-run.
6. The sync takes **~240–285 s**. Vercel Hobby accepts `maxDuration: 300`
   (verified: a 240 s function completes). It is close to the ceiling — if it ever
   overruns, the reports must be split into groups rather than the limit raised.

## Still local-only

- The Google service-account key (`GOOGLE_PRIVATE_KEY_PATH`) points at a Windows
  path and is not on this machine, so the **Customer Feedback (Google Sheets) sync
  is inactive** in the hosted run. The engine skips it gracefully. The owner
  decided on 16 Nov to leave it off for now — it is a deliberate gap, not an
  oversight, and it can be switched on by putting the key on the host.
- SMTP is not configured, so failure email alerts are skipped. GitHub's own
  workflow-failure notification still fires. The owner asked for email alerts to
  be switched on; it needs `SMTP_USER` / `SMTP_PASS` (a Google app password)
  on the Vercel production environment. `scripts/setup-smtp-alerts.sh` does it:
  it reads the app password from a file and pipes it into `vercel env add`, so
  the password never appears in a command line, in shell history, or in a
  screenshot of the terminal.

## The office computer's own schedule

The office PC registers two Windows tasks (`REGISTER-WINDOWS-SCHEDULE.bat`):
`Atelier_Petpooja_Startup_Sync` (on every boot) and
`Atelier_Petpooja_Noon_Failsafe_Sync` (daily at 12:00). Both must be switched
off now that the sync runs in the cloud — two Petpooja logins at once break
each other. `scripts/DISABLE-WINDOWS-SCHEDULE.bat` removes both; the local run
stays available by hand with `node scripts\smart-daily-sync.mjs`.

The local runner also **closes finished pay cycles** after a sync (locking the
cycle and freezing its figures into a snapshot). The hosted endpoint does the
same — `closeFinishedCycles()` now reads the Supabase environment variables
when there is no local config file, which there never is on the serverless
runtime.

## Useful limits (measured, not guessed)

- Vercel Hobby: `maxDuration: 300` honoured; 75 s and 240 s functions both pass.
- GitHub Actions on a **public** repo: unlimited minutes, free.
- Vercel preview deployments are protected by Vercel Authentication — use
  `vercel curl` to reach them. Production is not protected.
- `vercel env add <name> preview` prompts for a Git branch; pass
  `--git-branch <branch>` for a non-interactive add.
- `supabase db dump` needs Docker (absent on this machine) — use
  `scripts/backup-db.mjs` instead. See [[database-access-and-migration-state]].

Related: [[workflow-preferences]], [[tech-stack-atelier]], [[project-atelier-hr]]
