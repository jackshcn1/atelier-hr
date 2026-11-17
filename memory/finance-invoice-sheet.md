---
name: finance-invoice-sheet
description: "The Google Sheet the accountant fills in for electricity, gas, water, rent and marketing — the columns, and the four rules that stop the same rupee being counted twice."
metadata:
  node_type: memory
  type: project
  modified: 2026-11-17T13:00:00.000Z
---

# The accountant's invoice sheet

The bills that Petpooja does not know about — electricity, gas, water, rent,
pest control, marketing — come in through a Google Sheet the accountant
fills in. The system reads it.

**Proposed, not yet built** — the column set below is what was put to the
owner on 17 Nov 2026 and is waiting on their answer.

## The mechanic

A **Google Form** whose answers land in a Sheet. The system reads the Sheet
on the nightly run and on demand. The form is the accountant's front end, so
the column names are the form's question labels.

## The columns

| # | Column | Type | Required | Why it is there |
|---|---|---|---|---|
| 1 | `invoice_date` | date | yes | which month the invoice lands in |
| 2 | `vendor` | dropdown | yes | who was paid |
| 3 | `invoice_no` | text | yes | **the identity of the invoice** — this is what stops the same bill being counted twice |
| 4 | `description` | text | no | what it was for |
| 5 | `amount` | number | yes | the invoice amount |
| 6 | `bucket` | dropdown | yes | **where it goes: Variable / Fixed / Petty / Exclude** |
| 7 | `category` | dropdown | yes | Electricity, Gas, Water, Rent, Pest control, Marketing, … |
| 8 | `payment_status` | dropdown | yes | Paid / Pending — Pending shows under money owed |
| 9 | `payment_date` | date | if Paid | when it was paid |
| 10 | `payment_method` | dropdown | no | Cash / UPI / NEFT / RTGS / Card |
| 11 | `reference` | text | no | UTR or transaction reference, to match the bank statement |

Google Forms adds its own timestamp column, which the row id falls back to.

## What each bucket does

| Bucket | Where it lands |
|---|---|
| `Variable` | the month's cost of revenue — electricity, gas, water, marketing |
| `Fixed` | the month's fixed costs — rent, pest control, insurance |
| `Petty` | a petty cash expense — it comes off the float, and the float is checked against it |
| `Exclude` | nowhere — a capital purchase, a loan, a duplicate |

## The four rules that stop double counting

1. **A Petpooja bill is skipped by identity.** If `invoice_no` is already in
   the bill ledger, the sheet row is ignored. So even if the accountant types
   a Petpooja bill in, it is counted once — the Petpooja one. No reliance on
   everyone remembering not to.
2. **The bucket decides where an invoice lands.** Rent is `Fixed` and
   electricity is `Variable`, so they cannot both end up in the same place.
   This is the answer to "outlet rent shows in fixed and variable".
3. **The fixed-cost list stops holding amounts.** It becomes a list of the
   standing costs to remember — name, category, billing cycle — and the
   amount comes from the sheet. A standing cost with no row for the month
   reads as **"not received yet"**, not as a stale number from March.
4. **Salary is never typed.** It comes from HRMS, forecast then actual, so
   the bucket list has no "salary" option.

The same sheet row typed twice is also caught — the sheet is de-duplicated on
`invoice_no` before anything is written.

## The setup that is needed before any of it works

The reading side already exists (`lib/googleSheetsService.js`) but it needs a
Google **service account**:

1. create a service account in Google Cloud and download its key;
2. share the Sheet with the service account's email, as Viewer;
3. put the key on Vercel (`GOOGLE_SERVICE_ACCOUNT_EMAIL` and the key itself);
4. lock the sheet's columns so the labels cannot drift.

The key is best stored as the PEM **content** in an environment variable
rather than a file path — Vercel has no file to point at. The existing helper
reads a path, so it needs to accept the content too.

A Composio connection to a personal Google account was considered and not
chosen for this: an unattended nightly pull should not depend on a personal
connector staying connected.

Related: [[finance-calendar-month]], [[petpooja-hosted-sync]]
