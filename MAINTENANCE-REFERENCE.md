# Atelier HR — Maintenance Module Reference

_Last updated: 2026-10-20_

## 1. What the Maintenance module does

You record "this equipment needs fixing" on an **asset page**. A **work order** (job) is
created in the database. That job appears in the **Maintenance list**. Clicking it opens the
**job detail page** showing the whole life of the repair: who raised it, which vendor (POC),
quotes, completion, and a full audit trail.

## 2. The moving parts (map)

```
app/operations/assets/[id]/page.js        <- "Requires Maintenance" button, creates the job
app/operations/maintenance/page.js         <- Maintenance & Work Orders list
app/operations/maintenance/[id]/page.js    <- One job, all details
app/operations/maintenance-pocs/page.js    <- Vendor / POC directory

app/api/maintenance/jobs/route.js          <- GET (list all), POST (create)
app/api/maintenance/jobs/[id]/route.js     <- GET (one job), PATCH (update)
app/api/maintenance/audit/route.js         <- POST (write audit line)
app/api/maintenance/pocs/route.js          <- POC list/create
app/api/maintenance/quotes/route.js        <- Quotes

supabase/migrations/20261017100000_add_maintenance_module.sql        <- table shapes
supabase/migrations/20261018000000_add_maintenance_refinements.sql    <- extra columns
supabase/migrations/20261019000000_enable_maintenance_rls.sql         <- row security
```

## 3. Database tables

| Table | Holds | Key columns |
|---|---|---|
| `maintenance_jobs` | the work order | `id` (MNT-epoch), `asset_serial`, `service_type`, `priority`, `status`, `issues` (JSON), `comments`, `requested_by`, `requested_at`, `assigned_poc_id`, `completion_type`, `is_locked` |
| `maintenance_audit_logs` | every action taken | `job_id`, `user_name`, `action`, `details`, `comment`, `timestamp` |
| `maintenance_pocs` | vendors | `id`, `name`, `speciality`, `contact_primary`, `contact_alternate`, `reference`, `notes`, `star_rating`, `attachment_url` |
| `job_quotes` | price estimates | `id`, `job_id`, `vendor_name`, `quote_type`, `cost`, `estimated_delivery`, `status`, `is_approved` |

## 4. How login/permission works (do not break this)

- Every page and API call carries the logged-in person's **login token** in the header:
  `Authorization: Bearer <token>`.
- Every server route builds a Supabase client with that token, so **Supabase's own rules
  (RLS)** decide what that person may see. The app never bypasses the rules.
- `lib/supabaseClient.js` is the **browser-only** client. It must never be imported inside an
  API route (server). Use `@supabase/supabase-js` there instead.

## 5. Status flow of a job

`pending_approval` → approved → assigned → awaiting POC → in repair → awaiting quote → completed

## 6. Access I have (for testing)

| Thing | Details |
|---|---|
| Live site | https://atelier-hr-inky.vercel.app |
| Admin login | rishvin787@gmail.com / temp098 (Super Admin) |
| Vercel CLI | linked, project `atelier-hrms/atelier-hr` |
| Supabase CLI | linked, project `wzxswmopfxnucmeygqeg` |
| GitHub | jackshcn1/atelier-hr → push to `main` = deploy |

## 7. How to check a deploy worked

```bash
npx vercel ls --yes        # look for the newest row; it must say Ready, not Error
```

If it says **Error**, the build broke. Get the log from the Vercel dashboard (Deployments →
the failed one → Logs).

## 8. Rules I follow from now on

1. **Test on the real site with Playwright** before I say "done".
2. **Use unlazy** (`GATES.md`) so nothing is half-finished when reported.
3. **Keep replies short** (caveman style) — facts first.
4. **Give you steps like a 4-year-old** — no coding jargon, numbered steps, one action per line.

## 9. Traps already paid for (do not repeat)

- **Wrong folder depth in imports.** `app/operations/maintenance/[id]/page.js` must import
  `../../../../lib/supabaseClient` — four `..`, not three. Wrong depth = build fails = site
  stays on the old version. Check `npx vercel ls` after every push.
- **`supabase` CLI has no `sql` command.** `supabase db push` fails because an old migration
  was already applied. Run SQL by hand in Supabase Dashboard → SQL Editor.
- **This Postgres is old.** `CREATE POLICY IF NOT EXISTS` is a syntax error. Use
  `DROP POLICY IF EXISTS "name" ON table;` then `CREATE POLICY "name" ON table ...`.
- **`MNT-XXX` in the screen means a bug** — some code asked for a field named
  `job_number` that does not exist. The real field is `id`.
- **Never trust "the button worked".** A 201 response only means "row written". Always
  confirm the row shows up in the list AND the detail page opens.
