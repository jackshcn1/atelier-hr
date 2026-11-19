---
name: finance-thousand-row-rule
description: "The database answers a read with at most a thousand rows unless it is asked for more — and says nothing when it does. The bills page and the supplier page were quietly showing a fraction of the bills."
metadata:
  node_type: memory
  type: project
  modified: 2026-11-19T16:00:00.000Z
---

# A thousand rows is not an error

PostgREST answers a read with **at most a thousand rows** unless the query
is asked for more, and it says **nothing** when it stops: no error, no
warning, no truncation marker. The page just shows fewer rows than there
are.

The bills table passed a thousand in November 2026. Two pages read it whole:

- the bills page (`/api/finance/expenses`) — 1,000 of 2,452 bills
- the supplier page (`/api/finance/vendors`)

so both showed a **fraction of what was owed**. A total that is missing half
its bills is not a total. This is what the owner saw: a supplier shown as
owing ₹8,250 when the real figure was ₹25,375.

**The rule: a read that is meant to be whole has to say so.**
`lib/supabaseServer.js` has `readAllRows(build, pageSize)`, which pages a
query with `.range()`. The query **must be ordered** — a paged read with no
fixed sequence can serve a row on two pages and miss another.

The places that read the whole table now use it: the bills route, the
supplier route, and `expensesInWindow` in `lib/financeCosts.js` (the costs
of a month, which the dashboard and the P&L both use). A month holds about
300 bills today, so the window reads were never truncated — but the same
trap was waiting.

Two checks in `tests/finance-routes-verify.mjs` hold this in place: every
bill on record comes back, and the supplier list counts every bill.

## What the books actually say

The books and Petpooja's own export **agree**: the May 2026 purchase export
has 282 bills, of which **6 are Unpaid with a Paid Amount of 0**, and the
books carry exactly those 6 as unpaid (₹28,772). A re-pull reported "0 new,
0 updated, 282 unchanged".

## How to look at one month

The bills page has a **month dropdown** now — the same window Petpooja
reports on, so the two can be compared side by side. `?month=YYYY-MM` on
`/api/finance/expenses` does the same from the API.
