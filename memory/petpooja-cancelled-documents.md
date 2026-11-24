---
name: petpooja-cancelled-documents
description: "A cancelled Petpooja document is not a bill — the Purchase List keeps cancelled documents with an Unpaid payment column, so they came into the books as money the restaurant owes for goods never bought."
metadata:
  node_type: memory
  type: project
  modified: 2026-11-19T19:30:00.000Z
---

# A cancelled document is not a bill

Petpooja keeps **cancelled** documents in the Purchase List the sync reads, and
their payment column says **"Unpaid"** — because a cancelled document was
never paid. Petpooja's own Purchase Report leaves them out, so the two never
agreed.

Every cancelled document therefore came into the books as money the restaurant
owes, for goods that were never bought. On 19 Nov 2026 that was **42 bills
worth ₹1,80,708.74 and 6 debit notes worth ₹5,816** — all of it removed.

## What a cancelled document looks like

It is nearly always the **first attempt at a bill that was entered wrongly,
cancelled, and entered again**:

- `BSP 48538 b` ₹2,291 (Cancelled, Unpaid) beside `BSP 48538` ₹2,291 (Saved,
  Paid) — the same amount, the same day, the invoice number with a stray " b".
- `PSELVAMANI CBC-1042/26-27` ₹910 (Cancelled) beside `Ambrosia CBC-1042/26-27`
  ₹910 (Saved, Paid) — the same bill entered under the wrong supplier first.
- `Ambrosia Trf-STR/0345/26-27` ₹5,000 and `Trf-STR/0288/26-27` ₹16,800 — stock
  transfers that were cancelled.

## The rule

`lib/expenseParsers.js` skips a document whose Status is `Cancelled`, and
`parsePurchaseInvoices` / `parsePurchaseReturns` hand the cancelled documents
back so the sync can take them out of the books
(`removeCancelledBills()` in `scripts/petpooja-sync.mjs`). A bill pulled
*before* it was cancelled is removed on the next pull that sees it.

**A cancelled document with no live twin is a document to remove.** A document
that was cancelled and then entered again under the *same* supplier, number and
day is one bill, and the live one is the bill — four March bills are like
this (BSP 48513/48514/48515, A J AGENCIES 1). The parser compares the
cancelled document with the live ones before naming it, so the live bill is
never removed.

Only rows that came from Petpooja are removed. The `expenses.source` column
defaults to `'existing'`, so anything written without a source lands there —
the description (`Petpooja purchase bill`) is what tells those rows apart from
a bill a person typed.

## How the books were checked

The May 2026 export the owner pulled from Petpooja — 115 bills, all Paid,
₹5,69,260, 0 due — matches our books exactly once the cancelled documents are
out. A full pull of 1 Mar – 30 Nov 2026 reconciles bill for bill: **2,159
live bills in the report, 2,159 in the books, 0 missing, 0 mismatched**, plus
the accountant's 20 sheet bills that Petpooja knows nothing about.

## What is still not covered

A document **deleted outright** in Petpooja (not cancelled) leaves no trace in
the report, so the sync cannot see it and the books keep it. One such bill was
found (Ambrosia CBC-3751/26-27, ₹1,071, 31 Oct 2026). The **twice-weekly
refresh of the last 90 days** catches this now — a bill cancelled after its
cycle closed is picked up by the refresh, not left in the books until a
backfill covers its month.

See `memory/finance-thousand-row-rule.md` for the other way the books can
quietly understate what is owed.
