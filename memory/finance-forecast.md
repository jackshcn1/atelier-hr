---
name: finance-forecast
description: "How the Costs & Expenses forecast is worked out — the level, the festival factors, the variable cost ratio — and what each one rests on."
metadata:
  node_type: memory
  type: project
  modified: 2026-11-19T18:00:00.000Z
---

# The forecast on the Costs & Expenses page

**The bars on the Costs & Expenses page are not a share of the total any more.
Each one fills with the actual against the month's forecast: if the month was
forecast at ₹1,00,000 and ₹40,000 has come in, the bar is 40% full.** A thin
marker on the bar shows where the month should have reached by now, so a bar
that is behind can be told apart from a bar that is simply early.

The forecast is worked out in `lib/financeForecast.js`. Nothing about it is
invented at the page — every figure comes from the months on record.

## What it is built from

| Part | How | Why |
|---|---|---|
| **Level** (a normal month, per channel) | the **median** of what each channel earned in the complete months on record, after dividing each by that month's festival factor | the median, not the average, so one unusual month cannot swing the forecast |
| **Season factor** (per calendar month) | a fixed table in `lib/financeForecast.js` | Kerala and Indian festivals — see below |
| **Variable cost ratio** | the median of the variable costs as a share of the revenue over the **last four complete months** | the share has been falling as the business grew, so an older ratio is stale |
| **Fixed costs** | the standing-cost list's monthly total | it is a known commitment, not a guess |
| **Petty cash** | a blanket ₹15,000 a month | the ledger is empty; there is nothing to learn from it |
| **Staff salary** | the frozen forecast for that pay cycle, or the current run-rate for a month that has not happened | the payroll page's own figure, so the two can never disagree |

## The festival factors are judgement, not measurement

There is **one year of trading** — the restaurant opened in March 2026 — so
no month can be compared with another year, and the seasonality has to come
from the festival calendar:

| Month | Factor | |
|---|---|---|
| Jan | 1.02 | New Year |
| Feb | 0.98 | |
| Mar | 1.00 | Ramzan, 20 March |
| Apr | 1.02 | Vishu, 15 April, and Easter |
| May | 1.00 | Bakrid, 27 May |
| Jun | 0.96 | the monsoon lull |
| Jul | 1.00 | |
| Aug | 1.10 | Onam, 25–28 August |
| Sep | 0.92 | the weeks after Onam |
| Oct | 1.04 | Vijayadasami, 21 October |
| Nov | 1.05 | Deepavali, 8 November |
| Dec | **1.30** | Christmas and New Year |

**December has no history behind it at all.** Its forecast rests on the
festival calendar alone, and the page says so.

## The method was tested against the months we already know

July to October 2026 were forecast from the months before them, and the error
measured:

- **revenue: 5.6%** with the festival factors, against **9.5%** without them —
  the factors nearly halved the error;
- **variable costs: 14.8%** with the last four months, against **20.3%** over
  every month on record.

The level made little difference (4.7% to 5.8% across every window), so the
simplest rule was kept: every complete month on record.

## A month in progress

A month that is still running is measured against **what it should have
reached by now**, not against the whole month:

- revenue and the variable costs are pro-rated by the days that have passed;
- the standing costs and the salary are **not** — they are booked for the
  whole month on the first day, so they are already counted in full.

The month-by-month table shows a running month **projected** (the sales so
far, carried forward at the same rate) rather than as it stands — nineteen
days of sales measured against a whole month would read as a disaster.

The purchases land early: across the complete months, **60–67% of the
variable costs are booked by the 19th**, so a plain pro-rata marker is a fair
one.

## The readings are held for five minutes

`forecastHistory()` reads every cost row there is, which costs about a
second. The forecast does not change minute by minute, so the months on
record are held in the module for five minutes — the same pattern as the
Supabase client, which is already kept in the module.

## See also

- `memory/finance-calendar-month.md` — why the pages report on the calendar
  month, not the pay cycle.
- `memory/finance-salary-and-standing-costs.md` — how salary and the standing
  costs are counted.
