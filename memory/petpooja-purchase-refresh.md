---
name: petpooja-purchase-refresh
description: "The twice-weekly refresh that re-reads the last 90 days of purchases, so a bill Petpooja edited, paid, cancelled or deleted is in the books within days."
metadata:
  node_type: memory
  type: project
  modified: 2026-11-19T21:30:00.000Z
---

# The twice-weekly purchase refresh

The nightly sync pulls the pay cycle that is running, so a bill is looked at
for a month after its date and never again. But Petpooja lets a bill be
**edited or cancelled up to 90 days after its date**, so the books drift away
from what Petpooja says:

- a bill cancelled after its cycle closed stayed in the books as money owed;
- a payment recorded in Petpooja was never seen, so the bill stayed unpaid;
- an amount that was corrected stayed as it was;
- a bill entered late was never seen at all.

So the purchases are refreshed on their own schedule:
**`.github/workflows/petpooja-refresh.yml`, Monday and Thursday at 05:00 IST**
(`30 23 * * 1,4` UTC), running report groups 9 and 10 with `?refresh=90`.

It is a **separate workflow**, not a second cron on the nightly one — the
nightly run must stay small and fast, and a failed refresh must not disturb
it.

**The refresh is what keeps the calendar month current.** The 20–19 cycle is
for salaries; every bill belongs to the **calendar month** it is dated in. The
nightly pull reads the purchase reports over the running cycle window, so the
90-day refresh is what re-reads the bills of the current calendar month — and
everything still outstanding behind it. The window is not an accounting
decision.

## When a bill's paid state is actually found

Two ways, and they cover different bills:

1. **The twice-weekly refresh** re-reads the **last 90 days**, so a bill that
   has closed its cycle is looked at **twice a week**, and every bill of the
   calendar month with it. Ninety days is the same window Petpooja itself
   allows a bill to be edited in.
2. **The nightly run** re-reads the purchase reports over the running **cycle**
   window (the 20th onwards), so a bill dated inside the current cycle is
   looked at **every night**. That is a fact about the sync's window, not
   about the month a bill belongs to.

**The limit, stated plainly: a bill dated more than 90 days ago that is paid
now is not picked up automatically.** It has to be corrected by hand.

**The red nightly run is the alarm.** A run that goes red says *"the books may
not have been pulled"* — so the reason it went red has to be read, not
ignored. On 20, 22 and 23 November 2026 it went red, and on all three nights
**the purchase groups themselves succeeded** — the failure was elsewhere (a
report group on the 20th, the customer feedback pull on the 22nd and 23rd).
A red run for a reason that has nothing to do with the bills is a run that
teaches people to ignore the alarm.

**GitHub's schedule runs late.** The cron says 23:30 UTC; the runs have
started at 04:00–04:40 UTC — four to five hours later. A job on a schedule is
not a job that has happened.

## What a refresh may do

`?refresh=90` on `/api/sync`:

- **pulls the purchase reports only.** The sales report would rewrite a closed
  month's revenue, and the receivables report is a snapshot the nightly run
  already reads fresh every day. The route refuses a refresh that names any
  other report.
- **forces finance-only on itself** — it never touches the variable-pay
  figures, the pay periods or the sales report, whether or not the caller
  remembered `finance=1`.
- **names its own window** — the last 90 days ending today. It cannot be
  combined with a backfill: a backfill asks for a window of history by name,
  and two windows in one request is one too many.

The rules live in `lib/purchaseRefresh.js` and are checked on their own
(`npm run test:refresh`).

## What the refresh puts right

| | |
|---|---|
| a bill Petpooja has added | written into the books |
| an amount that was corrected | the books follow |
| a payment recorded in Petpooja | the bill stops being unpaid |
| a bill that was cancelled | taken out of the books |
| a bill Petpooja has **deleted** | flagged, then taken out at the next refresh |

A **deleted** document leaves no trace in any report — there is nothing to
read. The only sign is that the bill is in the books and not in the report,
which is a weaker signal than a cancellation. So it is handled with **two
strikes**: `finance_purchase_refresh_misses` holds the flag, and the bill is
removed only if it is still missing at the next refresh. A single odd export
can never remove a good bill. Only a row that came from Petpooja is ever a
candidate — the accountant's sheet rows and the hand-typed bills are nobody's
but theirs.

## The reconciliation

Every refresh says what it found, so a refresh that quietly did nothing looks
nothing like one that found nothing:

```
📊 Refresh check — 668 bill(s) in Petpooja's report, 670 in the books,
   668 matched, 0 missing, 1 extra, 0 mismatched.
🧾 Flagged: Ambrosia / CBC-3751/26-27 / 2026-10-31 — in the books but not in
   Petpooja's report. It will be removed if it is still missing at the next refresh.
```

A bill is identified by its **supplier, its invoice number and its day** —
Petpooja reuses an invoice number, so the same number can sit on a cancelled
document of one day and on the live bill of another. The case is not part of
it: the same bill is written "AMBROSIA" one day and "Ambrosia" the next.

## What it costs

A 90-day pull is one browser login plus two exports: **84 seconds** end to end
on this machine, and a purchase group on Vercel costs ~20s with the session
reused — far inside the 300-second serverless cap. Two runs a week, no new
infrastructure.

The nightly run is left exactly as it was: the current pay cycle, every day.
**The window it reads is not the accounting month** — the cycle belongs to
payroll; finance is the calendar month, and the refresh is what keeps it
current.

**And on demand:** the Bills page has a **"Check Petpooja for payments"**
button (`POST /api/finance/sync/purchases`). It runs the same 90-day refresh
on the spot, so the list of what is outstanding can be brought up to date
without waiting for the next scheduled run — which matters when the bills are
paid together on one day and the answer is wanted the same afternoon. The
route is for administrators only, and it says what the refresh found.
