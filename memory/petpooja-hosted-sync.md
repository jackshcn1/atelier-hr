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
  is inactive** in the hosted run. The engine skips it gracefully.
- SMTP is not configured, so failure email alerts are skipped. GitHub's own
  workflow-failure notification still fires.

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
