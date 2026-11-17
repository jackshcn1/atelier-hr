---
name: finance-calendar-month
description: "How the finance dashboards and metrics are scoped — the plain calendar month — and how calendar-month revenue is obtained from Petpooja."
metadata:
  node_type: memory
  type: project
  modified: 2026-11-16T13:40:00.000Z
---

# Finance reports on the calendar month

**The 20th–19th pay cycle is for salary processing and variable pay. The
finance dashboards and metrics use the plain calendar month, and the window
rolls over on the 1st.** Both live side by side, and neither disturbs the
other.

## Why a second revenue source was needed

Revenue and the 20–19 cycle were the same thing: the Petpooja Executive Sales
Summary was pulled for the cycle window and written to `variable_metric_inputs`
as `rev_dine_in` / `rev_pick_up` / `rev_delivery`. The dashboard then read
those metric rows, which is why "Total Revenue" showed **₹16,71,612** — the
Executive "Order Type" split for **20 Oct – 19 Nov 2026**, not a calendar
month:

| Channel | Amount |
|---|---|
| Dine-in | ₹6,67,719.26 |
| Pick Up | ₹2,83,827.03 |
| Delivery | ₹7,20,066.41 |
| **Total** | **₹16,71,612.70** |

A calendar month cannot be read out of a cycle figure, so the Executive Sales
Summary is now pulled **twice** in the `executive` report group:

- once for the **pay cycle** → `variable_metric_inputs` (unchanged, variable
  pay does not move), and
- once for the **calendar month** → the new `finance_monthly_revenue` table.

The Executive Sales Summary is the only Petpooja report that splits revenue by
order type, so there is no alternative source for the calendar-month split.

## The calendar-month pull (`scripts/petpooja-sync.mjs`)

`syncCalendarMonthRevenue()` runs after the cycle pull in the `executive`
group. It pulls:

- the **current** calendar month, up to today — so a running month shows the
  month so far; and
- the **previous** calendar month, in full, until a pull has covered its last
  day. That is what makes a completed month final.

So the steady state is one extra report pull a day, and two on the 1st of a
month. The pay-cycle metrics are untouched by any of this.

The month and the day are worked out in **IST (UTC+05:30)**, not on the
server's clock — the nightly sync runs at 23:30 UTC, which is 05:00 IST the
next morning, and the two disagree on the last day of a month.
`lib/financePeriod.js` is the one place that knows this; everything else asks
it.

## The table

`public.finance_monthly_revenue` — one row per calendar month:

| column | meaning |
|---|---|
| `month` | 'YYYY-MM', unique |
| `dine_in`, `pick_up`, `delivery`, `total` | the split, in rupees |
| `window_start`, `window_end` | the days the pull actually covered |
| `is_complete` | true once a pull has covered the last day of the month |

RLS is on and there are **no client policies** — the table is read only
through the server routes, which use the service role.

## The PostgREST trap that made the old dashboard wrong

The obvious way to write "the costs of this window, and also the ones with no
date" is one filter:

```js
.or('invoice_date.gte.X,invoice_date.lte.Y,invoice_date.is.null')
```

**PostgREST drops the whole `or` filter when it contains an `lte`,** and the
query then answers with every row in the table. No error, no warning — just
an unfiltered result. The old dashboard used exactly that filter, so "costs in
the pay cycle" was really "every cost ever recorded", and October and
November showed the same costs.

The fix is two plain queries that PostgREST handles correctly — the rows
inside the window, and the rows with no date. That logic now lives in
`lib/financeCosts.js`, which both the dashboard and the P&L use, so the two
pages cannot disagree about a month.

**How to apply:** never write a date window as a single `.or()` filter with an
`lte` in it. Use `.gte()` + `.lte()` (which are ANDed) and a separate
`.is('col', null)` query.

## The P&L used to be made up

`/api/finance/pnl` had `revenue = 5000000` hardcoded, expenses summed over
every row with no window, and the profit that number times 0.85 and then 0.9.
The page showed a confident, entirely fictional profit.

It is now a real statement for the calendar month:

```
revenue          calendar-month revenue (Petpooja)
cost of revenue  the variable costs of the month
gross profit     revenue - cost of revenue
operating costs  fixed costs + petty cash + staff salary
operating profit gross profit - operating costs
net profit       operating profit (no interest, depreciation or tax on the books)
```

## What the pages show now

- **Costs & Expenses** (`/finance/costs`) — revenue channels and cost
  breakdown for the calendar month, with a month picker. The "YTD /
  Forecasted" lines and the mock drilldown are gone; the drilldown now shows
  the real rows behind each total.
- **P&L** (`/finance/pnl`) — the statement above, for the calendar month.
- **Cashflow** (`/finance/cashflow`) — the month's transactions and the
  month's inflow, outflow and net. The month picker moves between months.

The month lives in `?month=YYYY-MM`, so a month can be linked and survives a
refresh. The default is the current month, up to today.

## The figures are only as complete as the books

The standing costs (`fixed_costs`) are entered by hand and are now filled in —
seven of them. The petty cash ledger is still empty. So the profit shown
carries the standing costs at their **expected** amounts, not at their real
ones, because no invoice has been entered for them yet. The dashboard says so
on the page, and the standing-costs page marks each line **Expected amount
used** until its invoice arrives.

This is not a bug in the reporting; it is the cost of the invoices not being
in the books yet. See [[finance-salary-and-standing-costs]].

## The pages that exist now (17 Nov 2026)

| Page | What it answers |
|---|---|
| `/finance` | the four finance modules |
| `/finance/costs` | revenue channels and the cost breakdown for the month |
| `/finance/costs/entry` | log a bill by hand |
| `/finance/bills` | what the restaurant owes its suppliers, bill by bill, grouped by supplier |
| `/finance/vendors` | the supplier list, with what is owed to each |
| `/finance/costs/fixed` | the standing monthly costs |
| `/finance/costs/petty` | the petty cash ledger |
| `/finance/cashflow` | the month's cash movements **and** the money owed by customers |
| `/finance/pnl` | the statement |

**Bills** and **Suppliers** are the mirror image of the receivables: the bills
page is money owed *to* suppliers, the cashflow page is money owed *by*
customers.

## The bill data speaks one language

`lib/expenseHelpers.js` is the single place that knows what an expense row
is. It exists because the manual entry form was broken in three ways at once
and nothing caught it:

- it sent `vendor_id`, a column the table has never had → `PGRST204`;
- it never sent `cost_type`, which the table requires → `23502`;
- it sent `""` where a date belongs → `22007`.

The form also called `/api/finance/expenses/[id]`, which did not exist, so
every Approve and Reject click was a 404. There is a route for one bill now.

Two spellings were normalised in the data (migration
`20261117150000_normalise_expense_vendor_and_payment_status.sql`):

- the supplier name — Petpooja writes it with a `[Supplier]` tag, sometimes
  missing, so the same supplier was two suppliers;
- the payment state — `Paid`, `Unpaid` and `due` were three spellings of two
  states, so a filter on it missed most of the bills.

**The supplier list is built from the bills** (`syncVendorList()` in the sync
engine), so a new supplier appears the morning after its first bill. The
bills are the truth about who the restaurant buys from.

**A bill is identified by (supplier, invoice number), compared without regard
to capitalisation**, and the existing bills are fetched by invoice number in
batches of 150. Looking them up by supplier name was wrong: the name is
written by a third party and can change its capitalisation or its tag between
one day and the next, and a bill would then be written twice.

## The dashboards say what is missing

`lib/financePosition.js` returns, for a month, the money owed by customers,
the money owed to suppliers, and a **readiness** list — each part of the
picture marked `ok`, `empty` or `pending`. The dashboard and the P&L both
show it.

This matters because a profit shown without its fixed costs is not a real
profit, and the page used to show a confident large number with no warning
that half the costs were simply not in the books yet.

Related: [[petpooja-hosted-sync]], [[database-access-and-migration-state]]
