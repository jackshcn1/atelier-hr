---
name: petpooja-hosted-sync
description: "How the Petpooja daily sync is hosted (Vercel), why it cannot run on a GitHub runner, and the constraints that must not be broken."
metadata:
  node_type: memory
  type: project
  modified: 2026-11-19T12:00:00.000Z
---

# Petpooja Hosted Sync (replaces the local-computer job)

## The nightly run pulls the current window; a backfill fills the history

The nightly sync pulls the month that is running and the pay cycle that is
running. The months before them are never looked at, so on 19 Nov 2026 the
books held sales for October and November only, and the vendor bills for
March–June that had come from the accountant's sheet — July, August and the
first half of October were missing altogether.

**A backfill names the window it wants** (`lib/syncBackfill.js`):

    ?from=YYYY-MM-DD&to=YYYY-MM-DD   the purchase and purchase-return reports
    ?revenueMonth=YYYY-MM             one calendar month of sales

Both are refused unless the run is finance-only (`finance=1`), because a
window change moves the pay cycle and the pay cycle belongs to payroll.
`scripts/backfill-finance-history.mjs` drives the pulls month by month and
prints what the books hold afterwards.

**The history is now filled** (19 Nov 2026): March–October have sales,
bills and returns. December 2025 – February 2026 are still missing — the
reports were never pulled for them.

### The Executive Sales Summary does not always take the date range

It sometimes answers with the report's own default window instead of the
month that was asked for, and the tell is a figure that is **identical to
another month's** (two months came back with the very same ₹21,317.32).

So:

- a figure that repeats another month's is **not written** —
  `repeatsAnotherMonth()` in `lib/financePeriod.js`;
- the pull is **tried again** first — a report that did not take the range
  usually takes it the second time;
- the backfill runner checks the same way and puts the month back the way it
  was if the figure is not believable.

**A wrong month is worse than a missing one.** A month with no figure is
shown as missing, which is honest; a month with the wrong figure is not.

### A pull must not wipe how a bill is classified

Petpooja is the record of a bill's **facts** — how much, when it is dated,
whether it is paid. It knows nothing of the **category**, and the category is
what matches a bill to its standing cost (rent, pest control, power).
`mergePetpoojaBill()` in `lib/expenseHelpers.js` carries the classification
over; the accountant's "Digital Marketing Retainer" stays a fixed cost
instead of turning into a variable "Vendor" bill.

**How to apply:** the nightly job keeps the last month current — it does not
fill history. If someone asks for an older month, check what is on record
first, and backfill it deliberately (back up the database first, one window
per request, because of the 300 s serverless cap).

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
reports are split into groups and the workflow calls them one after the
other (never in parallel — they write the same metric rows):

| Group | Report | Measured (fast day) |
|---|---|---|
| 1 | `captain` | ~60 s |
| 2 | `pax` | ~50 s |
| 3 | `item` (8.4 MB Item Report) | ~75 s |
| 4 | `gstn` (Corporate GSTN Summary) | ~70 s |
| 5 | `due_payment` | ~60 s |
| 6 | `executive` (17-sheet workbook) | ~80 s |
| 7 | `kot` (needs the Base Menu too) | ~70 s |
| 8 | `inventory` (wastage) | ~70 s |
| 9 | `purchase_invoices` | ~75 s |
| 10 | `purchase_returns` (debit notes) | ~110 s |

**The groups are sized for a slow day, not a fast one.** Petpooja's pages can
take twice as long to load; a group that fits on a good day but not on a bad
one fails the whole nightly run. An earlier four-group layout put gstn +
due_payment + executive + kot together, which measured 188 s on a fast day and
went past 300 s on a slow day. A six-group layout (two reports each) also went
past the ceiling on a slow afternoon — groups 4 and 5 came back **HTTP 504**
after exactly 300 s. **One report per group** is the layout that survives a bad
day; the extra cost is one login.

- `?group=1..10` selects one group; `?reports=a,b` selects an explicit
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

## The session must be closed, or the next login is refused

On 16 Nov the hosted run failed from **group 5 onwards**, every group, with:

```
✓ Filled email address.
⚠️ Password box never appeared.
```

The email step was accepted and the password step never came. That is
Petpooja's own "a session is already open for this account" behaviour. It
looked like three different problems all day — a dead browser, a page that
never painted, an HTTP 504 — and none of those was the cause.

**Closing the browser does not end the Petpooja session.** The session
(`user_id` + `user_key`) stays live on Petpooja's side. From the serverless
host each group can come from a different egress IP, so each one looks like a
new device and leaves another live session behind, until the next login is
turned away. The symptom is always the same: the email field appears, the
password field never does.

The fix is to log out, not to close the browser:

```js
await page.goto('https://billing.petpooja.com/users/logout', {
  waitUntil: 'domcontentloaded',
  timeout: 20000,
});
```

It runs in the `finally` block, so it happens even when a group fails. After
it, three groups in a row passed back to back on the server (73 s, 72 s,
81 s) where before the second group was already being refused.

**How to apply:** when a login is refused on the serverless host, log out at
the end of every run — do not go looking for a throttle or a network block.
A plain `fetch` of the login page from the same host returning HTTP 200 while
the browser is refused is the tell: the site is answering, the *session* is
the problem. The probe is in the error message for exactly this reason.

## One login per run: carry the session between groups (16 Nov 2026)

Logging out after every group works, but it costs **one login per group** —
ten logins for one nightly run, and every one of them is a chance to be
refused.

The session is just three cookies on `.petpooja.com`:

| Cookie | Purpose |
|---|---|
| `user_id` | the logged-in user |
| `user_key` | the session token |
| `PETPOOJA_CO` | the company/tenant cookie |

A probe (log in, close the browser, replay the cookies in a fresh browser)
landed **straight on `https://billing.petpooja.com/users/dashboard`** with no
login at all. That is the whole fix: the first group logs in and hands its
cookies to the next group, which restores them and goes to work.

**The refusal is about the IP, not the account.** In the same probe, a second
login *from the same IP* succeeded even with a live session open. So Petpooja
lets a login through when it comes from the address that owns the session, and
turns it away when it comes from a different one. Serverless invocations do not
share an egress address, which is exactly why every group after the first was
being refused. Replaying the cookie avoids the login altogether, so the IP
never comes into it.

How it is wired:

- `scripts/petpooja-sync.mjs` — `runPetpoojaSync({ keepSession })`.
  `tryReuseSession()` restores the cookies and checks for the dashboard; if
  that fails it logs in as before. `keepSession: true` leaves the session
  alive and stores it; the last group of the run leaves it out and logs out.
  A group that **failed** always logs out, so the next group starts clean.
- `public.petpooja_sync_session` — the live session, **one row**, stored in
  the database. This is the carrier: any group can pick it up, including the
  first group of a run that was interrupted. It is read and written by the
  engine alone, through the service role; RLS is on and there are no client
  policies.
- `app/api/sync/route.js` — `?keepSession=1` and nothing else. The route does
  not pass the session around; it does not need to.
- `.github/workflows/petpooja-sync.yml` — calls the groups in order, with
  `keepSession=1` on all but the last. No session handling at all.

The session is a live credential: it is never written to the log, never put
in the response body, and never held in a CI variable.

**A refused login must release the session it is holding.** Petpooja turns a
login away while another session is alive. The engine keeps the cookies it was
given, so when the password box never appears it visits the logout URL with
those cookies — that releases the session on Petpooja's side — and tries
again. Without this, a stale session from a different address locks the
account until a human clears it.

**A browser that dies must not lose the session.** `openBrowser()` puts the
carried cookies into every new context, so a replacement browser comes up
with the session already in it, and `tryReuseSession()` retries once on a
fresh browser when the old one dies.

**How to apply:** do not "fix" a refused login by adding retries. Restore the
session, and release it if the restore is refused.

**A password box on the page does not mean you are logged out.** The dashboard
page keeps a password input in the DOM (a change-password modal), so
"is there a password field?" is the wrong test. The right test is the URL:
`/users/dashboard` means the session is live.

## A failed group must not throw the session away (16 Nov 2026)

A ten-group run on 16 Nov failed from group 5 onwards. Groups 1–4 passed,
including two clean session restores. Then:

1. Group 5's browser died.
2. The stored session was deleted, because the code deleted it whenever a
   group failed.
3. But a group that fails because the browser died leaves the Petpooja session
   **alive** — only the logout ends it.
4. So group 6 had nothing to restore, tried a fresh login, and was **turned
   away** because the session was still live.

One dead browser could lock the whole account until a human cleared it. The
rule now: **the stored copy is deleted only when the session was really
ended** (a logout actually happened). When the browser dies, the copy stays
and the next group picks the session up again.

**How to apply:** the stored session and the live session are the same thing.
Never delete one without the other.

## The session must never reach the log

The response body of `/api/sync` is printed into the workflow log. The live
session was in that body, so the login cookies were being written into the
build log. The engine now returns nothing at all, and the session never
leaves the database.

## The dashboard page is what kills the browser (16 Nov 2026)

The single most useful fact found on 16 Nov: **the bundled Chromium does not
die at random — it dies on the billing dashboard page.** That page is a heavy
single-page app, and rendering it in a single-process headless shell on a
one-vCPU serverless box is what takes the browser down. Every failure in
every failed run traces back to it:

- the session restore loaded the dashboard, just to see whether the saved
  session was still good — the browser died there;
- the inventory module loaded the dashboard to start the single sign-on to
  `inventory.petpooja.com` — the browser died there.

Both of those need a **cookie**, not a picture of a page, and both can be
done with a plain HTTP request (`context.request.get`) that never draws
anything:

- **Checking the session**: a plain `GET /users/dashboard` with the saved
  cookies answers the same question — the response lands on the dashboard
  when the session is live and on `/users/login` when it is not. The report
  page then becomes the only page the browser ever loads.
- **The inventory single sign-on**: the hand-off to the inventory subdomain
  is the `PETPOOJA_CO` cookie, and a plain request to the dashboard
  **rotates** it. With the fresh cookie the inventory pages open directly;
  without it they bounce straight back to the billing dashboard. Verified
  both ways.

With those two changes groups 1–8 of the run passed in a row for the first
time, and the crash rate dropped from roughly one group in three to one in
twenty.

**How to apply:** on this host, do not put a heavy page in front of a cookie
that a plain request can fetch. If a report page still needs something, ask
whether the browser has to see it at all.

## Two separate problems on the serverless host

Do not confuse these — they have different causes and different fixes:

| Symptom | Meaning |
|---|---|
| `Login did not reach the dashboard` / the password box never appears | Petpooja turned the login away (a session is already live) |
| `Target page, context or browser has been closed` | the bundled Chromium died |

The login works fine from an ordinary browser on the same account (verified),
so a refused login is about the **address**, not the account. Petpooja turns
away a login that comes from an address it does not recognise as the one
holding the live session, and serverless invocations do not share an egress
address. The bundled Chromium also crashes intermittently on the serverless
host, right after the password is filled.

Both push in the same direction: **log in as rarely as possible.** One login
per run, restored for the other nine groups, is the answer to both.

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

- The **platform ratings** (Zomato, Swiggy ×2, Google) are read by
  `scripts/sync-platform-ratings.mjs` on the office Mac, every morning at 05:00
  IST, through a **launchd** job (`com.atelier.platform-ratings`) installed by
  `scripts/setup-ratings-schedule.sh`. It cannot go into the hosted run for a
  different reason than Petpooja's: **Swiggy refuses a plain fetch and refuses
  headless Chrome**, and Vercel's `@sparticuz/chromium` is a headless *shell*
  build that cannot run headed at all. See `memory/customer-section.md`.

- The **customer feedback sheet pull is retired** (23 Nov 2026). The form is
  filled in inside the app now and a response is written straight into
  `customer_feedback`; there is no sheet and nothing to pull. The sheet's
  pull had failed for two nights running — it rewrote all 515 customers one
  request at a time, which took 126 seconds against a 120-second limit. The
  replacement is `?link=feedback`, which attaches a response to its order
  once the order has arrived: one statement, **1.1 seconds**. See
  `memory/customer-section.md`.

- The Google service-account key **is** on the server now, so the
  **accountant's invoice sheet** pull (`?sheet=1`) runs in the hosted run and
  writes bills into the books. The key is held as PEM **content**, which is
  what Vercel can hold.

- The **variable-pay** feedback metrics still read the old feedback sheet
  through `lib/feedbackParsers.js`. That path is **dormant** — variable pay
  is paused, and a finance-only run never pulls it.

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

## Finance-only mode (17 Nov 2026)

The variable-pay metrics are paused by the owner's decision, so the nightly
run pulls the **finance reports only** and writes nothing to the
variable-pay rows.

| | |
|---|---|
| Reports pulled | `due_payment`, `executive`, `purchase_invoices`, `purchase_returns` |
| Groups in the workflow | 5, 6, 9, 10 |
| Trigger | `?finance=1` on `/api/sync` → `SYNC_FINANCE_ONLY=1` |
| Back to variable pay | the `variable_pay` switch on the manual trigger, which runs all ten groups |

What a finance-only run does **not** do:

- writes nothing to `variable_metric_inputs` (`saveMetric()` returns early);
- does not open, lock or create a pay period in `variable_pay_periods`;
- does not close a finished pay cycle (`closeFinishedCycles()` is skipped);
- does not pull the Google Sheets customer feedback (it writes metric rows).

Measured on production, 17 Nov 2026, all four groups green in one run:

| Group | Report | Time | Result |
|---|---|---|---|
| 5 | `due_payment` | 41 s | 13 open invoices, ₹89,243 outstanding, ₹55,890 overdue, 8 customers |
| 6 | `executive` | 37 s | calendar month 2026-11 → ₹10,30,035.74 covering 1–17 Nov |
| 9 | `purchase_invoices` | 24 s | 211 invoices downloaded, 0 duplicates |
| 10 | `purchase_returns` | 25 s | 27 debit notes, 1 new |

`variable_metric_inputs` stayed at 34 rows across the whole run — the proof
that a finance-only run leaves variable pay alone.

**The bill de-duplication is by invoice number, not by row order.** A bill is
identified by (supplier, invoice number) compared without regard to
capitalisation, and the existing bills are fetched by invoice number in
batches of 150 — a long list of invoice numbers makes a long address, and a
long address is refused by the database gateway. The supplier name is no
longer the lookup key, because Petpooja writes it with a `[Supplier]` tag
that is sometimes missing, and a case change in the name would otherwise
write the same bill twice.

**The supplier list is rebuilt from the bills** on every run
(`syncVendorList()`), so a new supplier appears the morning after its first
bill. The bills are the truth about who the restaurant buys from.

## The invoice sheet is its own step (17 Nov 2026)

The accountant's Google Sheet is **not** a Petpooja report, so it needs no
browser and no login — it is one API call, about a second.

`POST /api/sync?sheet=1` pulls it and stops there. The workflow calls it once,
after the report groups. It is a separate request on purpose: it keeps the
sheet clear of the browser work and clear of the 300 s ceiling, and it cannot
disturb the Petpooja groups.

- **A sheet that is not set up yet is not a failure.** The request answers
  `{"ok": true, "skipped": true}` and the nightly run carries on.
- **A sheet that is set up but broken answers HTTP 500**, so the scheduler
  retries it.

See [[finance-invoice-sheet]] for the columns and the rules that stop a rupee
being counted twice.

## A preview build must not need a secret (17 Nov 2026)

Every preview build failed with `supabaseKey is required`, and the failing
route was always the first one Next happened to load. The preview environment
has no service-role key, and the eight finance routes made their client at
**module scope** — `createClient` throws the moment it is loaded without a
key, and Next loads every route while it builds.

The consequence was worse than a red tick: **the Vercel check on every pull
request had been red since PR #23 whatever the change was**, so a real break
in a route could not be told apart from the missing key. A check that is
always red carries no information.

The client is now made on first use (`lib/supabaseServer.js`) and inside each
route's try block, so a missing key answers with a clear message instead of an
unhandled throw. Production has the key, so nothing changes there. A preview
without one now **builds**, and its finance routes fail only when they are
actually called.

**How to apply:** do not put the service-role key into the Preview environment
to make a preview build pass — that would hand the key to every preview
deployment of the project, including one made from a fork. Make the code
tolerate the missing key instead. **Never add the service-role key to the
generic Preview environment.** It is set for Production and Development only,
plus one branch-scoped preview.

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
