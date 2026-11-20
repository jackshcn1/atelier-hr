---
name: finance-salary-and-standing-costs
description: "How staff salary and the standing costs enter the P&L — a salary forecast frozen at the 1st of the month after the cycle ends, replaced by the real payroll figure; and a standing-cost checklist where the month's invoice replaces the expected amount."
metadata:
  node_type: memory
  type: project
  modified: 2026-11-17T13:00:00.000Z
---

# Staff salary and standing costs in the P&L

Two things that were missing from the profit and are now in it: **staff
salary** and the **standing costs** (rent, pest control, broadband).

## Staff salary — a forecast that becomes the real figure

`lib/financeSalary.js` is the one place that knows this.

**The cycle that *ends* in the month is the one that counts.** The pay cycle
runs from the 20th of one month to the 19th of the next, so the cycle ending
in November 2026 is **2026-10-20 → 2026-11-19** — and that is the salary that
November is charged.

| the cycle ends in | the cycle is | the roster is settled on |
|---|---|---|
| October 2026 | 2026-09-20 → 2026-10-19 | 1 Nov 2026 |
| November 2026 | 2026-10-20 → 2026-11-19 | 1 Dec 2026 |

**Forecast.** Until the payroll for that cycle has been run, the salary is
forecast: every employee who is on the staff on the settlement date, at their
full fixed + variable salary for a full month. The settlement date is the
**1st of the month after the cycle ends** — that is the moment the roster for
that cycle is settled, so a joiner next month cannot quietly rewrite last
month's forecast and make two months incomparable.

**Actual.** Once the **regular** payroll run for that cycle exists, the
forecast is replaced by the real figure: `fixed_pay + variable_pay + bonus_pay`
from `payroll_line_items`. That is the *employment cost*. `total_pay` is the
*cash* that goes out — the two differ by the deductions and by any advance
already paid, so both are reported.

**Two things are deliberately not counted:**

- **A salary advance is cash out, not cost.** An off-cycle run pays the money
  early; it is not a cost of the month. It is reported separately as
  "already advanced" so the cashflow page can show it. The payroll's own
  prior-payout deduction settles it when the regular run happens.
- **Variable pay is not forecast.** It depends on the month's results, which
  are not known until the month is over — and it is paused anyway.

**Salary is an operating cost, not cost of revenue.** It sits with rent and
power, so the gross margin still means something. This is deliberate: gross
profit is "what the food and the floor sold for, less what the food and the
suppliers cost". Putting a month of salary under it would leave a gross
margin that no restaurant owner would recognise.

**Where the money sits in the books:**

- `payroll_runs.period_start` identifies a cycle. An **off-cycle (adhoc) run
  carries a broken `period_end`** — for the Nov cycle they all read
  `2026-10-19`, so `period_end` cannot be trusted to find a cycle.
- `payroll_runs.run_type = 'regular'` is the run that carries the cycle's
  salary. The adhoc runs have a fixed pay of zero.
- `employees` primary key column is **`employee_id`**, not `id`.

## Standing costs — a checklist, not a number

The standing-cost list is **what the month is expected to cost**. When the
invoice for that month arrives it **replaces** the expected amount — it never
adds to it, so the same rent is never counted twice.

`lib/financeCosts.js` does the matching. A standing cost has a `category`
(migration `20261117180000_fixed_cost_category.sql` added the column and
backfilled it from the name). A cost row is matched to a standing cost when
their categories are equal, ignoring case and surrounding spaces.

```
standing cost with an invoice   →  the invoice's amount is what the month counts
standing cost without an invoice →  its expected amount is what the month counts
fixed cost on no standing list   →  still counted, under its own name
```

The page (`/finance/costs/fixed`) shows each line as **Received** or
**Expected amount used**, so it is obvious when a number is still an
assumption rather than a bill.

The expected amount of an **annual** cost is spread over twelve months
(`monthlyAmount()`); `Petpooja Annual Bill` at ₹40,000 counts as ₹3,333.33 a
month.

## Why this matters for the sheet that is coming

The accountant's sheet is the **only place an amount is written**. The
`bucket` column decides what a line is:

- `variable` → cost of revenue (electricity, gas, water, marketing)
- `fixed` → matched against a standing cost by category, and **replaces** the
  expected amount
- `petty` → petty cash

Because a fixed line on the sheet replaces the expected amount rather than
adding to it, the outlet rent appears **once** — as the invoice, not as the
invoice plus the standing-cost expectation.

The site's bill form (`/finance/invoice-entry`) is the way a bill is entered: it
writes into the accountant's sheet and the sheet is pulled into the books, so
the standing cost is ticked off by the same rule as a bill typed in the Form.

## The figures as they stand (17 Nov 2026)

| | |
|---|---|
| Revenue (1–17 Nov) | ₹10,30,575 |
| Cost of revenue (125 bills) | ₹4,78,842 |
| Credit notes, shown separately | ₹16,388 |
| Gross profit | ₹5,51,733 (53.5%) |
| Staff salary | ₹2,25,000 — **forecast**, 12 on the roster |
| Standing costs | ₹3,06,687.15 — 7 of 7 awaiting their invoice |
| Net profit | ₹20,046 (1.9%) |

**The November profit is not a settled number.** The revenue covers 17 of 30
days; the salary and the standing costs are for the whole month. The P&L says
so on the page — a month in progress is marked **"Still running"** rather than
"In profit".

Related: [[finance-calendar-month]], [[finance-invoice-sheet]],
[[payroll-business-logic]]
