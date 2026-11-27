---
name: petpooja-purchase-refresh
description: "The twice-weekly refresh that re-reads the last 90 days of purchases, so a bill Petpooja edited, paid, cancelled or deleted is in the books within days — and the button that asks for it by hand, the two-strikes-three-days rule that protects a bill from being deleted by accident, and the supplier-tag bug of 24 November 2026."
metadata:
  node_type: memory
  type: project
  modified: 2026-11-24T12:00:00.000Z
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

## The two strikes must be days apart

The refresh used to run only on Mondays and Thursdays, so its two sightings
were **always days apart** — that is what made two strikes evidence rather
than an accident. The Bills page can now ask for a refresh by hand, so two
presses minutes apart would have counted as two sightings, and could have
removed a real bill.

So a bill is removed only when it has been missing at **two refreshes** *and*
the first sighting is at least **three days** old
(`MIN_DAYS_BEFORE_REMOVAL` in `lib/purchaseRefresh.js`). The days are counted
from the **first** sighting, not the last — a bill flagged on the 20th is
removed on the 23rd however many times it was read in between, and a bill read
twice in the same minute is not removed at all. A bill Petpooja really has
deleted is therefore removed at the **next scheduled run** rather than at the
next press of the button — a few days later, and that is the price of not
being able to delete a bill by accident.

The refresh says which of the two it is: *"It will be removed if it is still
missing after 3 days"*, or *"It has been missing for 1 day(s) now — it is
removed once 3 days have passed and it is still missing."*

## The reconciliation

Every refresh says what it found, so a refresh that quietly did nothing looks
nothing like one that found nothing:

```
📊 Refresh check — 668 bill(s) in Petpooja's report, 670 in the books,
   668 matched, 0 missing, 1 extra, 0 mismatched.
🧾 Flagged: Ambrosia / CBC-3751/26-27 / 2026-10-31 — in the books but not in
   Petpooja's report. It will be removed if it is still missing after 3 days.
```

A bill is identified by its **supplier, its invoice number and its day** —
Petpooja reuses an invoice number, so the same number can sit on a cancelled
document of one day and on the live bill of another. The case is not part of
it: the same bill is written "AMBROSIA" one day and "Ambrosia" the next.

## The supplier's name must not carry a tag into the identity

**This was a real bug, and it cost a morning.** On 24 November 2026 the first
press of the button wrote **649 duplicate bills** into the books and flagged
**651 real bills** for removal — one refresh away from deleting them.

**The cause.** Petpooja does not spell the supplier the same way in every
export. The purchase **report** writes `Ambrosia [Supplier]`; the purchase
**list** writes `Ambrosia [Vendor]`. `cleanVendorName()` stripped only
`[Supplier]`, so a bill whose export carried `[Vendor]` was keyed differently
from the same bill already in the books. The refresh therefore **inserted it a
second time** and reported the original as missing from Petpooja — which put
the original on the list of bills to be removed.

**It was not the button's fault.** The bug was already there; the scheduled
Monday refresh would have hit it on its own. The button simply got there
first.

**The repair**, the same morning, after a full backup:

- All **651 flags** were cleared at once, before anything could remove a bill.
- The **468 bills that had a tagged twin** were matched to their clean twin,
  the clean twin's paid state was copied across where it differed, and the
  tagged copy was deleted. The **clean** row was kept, because it carries the
  books' own classification (category, cost type, entry type, approval) — the
  tagged copy was only a copy.
- The **202 tagged bills with no clean twin** were genuinely missing from the
  books, so they were kept and renamed.
- The books ended with **2,412 Petpooja bills, 79 sheet bills, 211 older bills,
  0 duplicates, 0 flags**.

**The fix, in two places**, because either one alone would leave the trap
half-closed:

- `cleanVendorName()` now strips **any** trailing bracketed tag
  (`/\s*\[[^\]]*\]\s*$/`), not just the one we happened to know about.
- `scripts/petpooja-sync.mjs` keys the rows **already in the books** with
  `cleanVendorName(row.vendor_name)`, so a tag on **either side** of the
  comparison cannot give a bill a second identity.

**The lesson.** A bill's identity must not depend on how one particular
export happened to spell its supplier. **Clean the name before comparing it,
on both sides** — the row from Petpooja and the row in the books.

## The vendor list had the same disease

**The Suppliers page joins two tables by a name.** `vendors` says who the
restaurant buys from; `expenses` carries the supplier's name on every bill.
The join was **the text as typed**, on both sides — so one supplier written
two ways was **two rows**, and the money split between them.

On 27 November 2026 the vendor list held **60 rows for 54 suppliers on the
bills**, with three pairs of twins:

| Kept | Folded in | Why it is the same supplier |
|---|---|---|
| `Wholegrains - The Baker's Hub` | `WHOLE GRAINS - THE BAKER S HUB` | the same shop, spacing and a missing apostrophe |
| `Ambrosia - The Classic Bakehouse` | `Ambrisia - The Classic Bakehouse` | a typo in the second one |
| `COCHIN LIMRA SALES` | `COCHIN LIMRA SALES-TVM [BR]` | the branch tag the rule already strips |
| `KR Agency` | `K R Agency` | one agency — **the only pair where the money was split** |
| `THOMSON TRADING AGENCIES` | `Thompson Traders` | one supplier, two spellings |

`SREE ANJANEYA ENTERPRISES` was looked at too and **left alone** — it is a
supplier of its own, with its own bill. **What the rule cannot decide, the
owner decides.**

**What it cost.** Each twin held **no bills and no assets** — the money was
already on the other row — so the totals were not wrong. But the twins were
**rows a certificate could be filed against and never be seen**, which is the
whole point of the compliance register that is being built.

**Three bills had no supplier at all** — `ANANDAM HOME CATERING`, `S IBRAHIM
& CO` and `More Retail private limited`. They were added to the list, so the
yellow panel on the Suppliers page is gone: **every bill now has a supplier**.

**The fix, in three places**, because any one alone would leave it half-closed:

- **`lib/vendorName.js`** — one way to name a vendor. `vendorNameKey()` is the
  name cleaned of a trailing bracketed tag, case, punctuation and a trailing
  legal form (`& CO`, `private limited`). The common Indian trade words —
  `ENTERPRISES`, `STORES`, `TRADERS` — are **not** stripped: they are part of
  the name. The rule is deliberately conservative: **a missing apostrophe is
  not folded** (`Baker's` vs `Bakers`), because that is a judgement, not a
  rule. Those pairs were merged by hand.
- **`app/api/finance/vendors/route.js`** — the bills are joined to the vendor
  list **by the key, on both sides**, and **adding** a vendor whose key
  matches one already on the list is **refused by name** — the same way the
  invoice entry refuses a bill that is already on the sheet.
- **`scripts/merge-vendor-duplicates.mjs`** — the pairs are listed **in the
  script, on purpose**, because which two names are the same company is the
  owner's judgement. It moves the bills, the assets and the petty-cash
  entries over to the vendor being kept, then deletes the twin. It writes a
  record beside the backups.

**The lesson.** The same one, on the other side of the join: **a name is an
identity only if there is one way to write it.** The bracketed tag that was
stripped from a bill has to be stripped from a vendor row too — and where
the rule cannot decide, the merge is written down by hand rather than
guessed at.

## What it costs

A 90-day pull is one browser login plus two exports: **84 seconds** end to end
on this machine, and a purchase group on Vercel costs ~20s with the session
reused — far inside the 300-second serverless cap. Two runs a week, no new
infrastructure.

**Measured on the deployed site, through the button:** the healthy run took
**87 seconds**. The very first run — the one that had to write 651 flags, one
row at a time — took **262 seconds**, because 651 × ~250 ms ≈ 176 s of it was
writing the flags. That per-row flag write is still a slow path if a whole
batch of extras ever appears again, so a run that finds many extras is the one
to watch.

The nightly run is left exactly as it was: the current pay cycle, every day.
**The window it reads is not the accounting month** — the cycle belongs to
payroll; finance is the calendar month, and the refresh is what keeps it
current.

**And on demand:** the Bills page has a **"Check Petpooja for payments"**
button (`POST /api/finance/sync/purchases`). It runs the same 90-day refresh
on the spot, so the list of what is outstanding can be brought up to date
without waiting for the next scheduled run — which matters when the bills are
paid together on one day and the answer is wanted the same afternoon. The
route is for administrators only, and it says what the refresh found —
including anything it took out of the books. **Pressing it twice in a row
cannot delete anything**: a bill has to be missing for three days as well as
twice (see *The two strikes must be days apart*).
