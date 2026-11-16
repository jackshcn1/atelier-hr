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
operating costs  fixed costs + petty cash
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

`fixed_costs` and `petty_cash_ledger` are entered by hand and are both empty
today, so the profit shown is revenue minus the Petpooja vendor bills alone —
which is why the margin looks high. The dashboard says so on the page. This is
not a bug in the reporting; it is the cost of not having entered the standing
costs yet.
