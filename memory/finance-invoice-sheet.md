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

**The reader is built** (`lib/invoiceSheet.js`, wired into the nightly run as
`?sheet=1`). **It is dormant** until the Google service account is set up —
without the key it answers "skipped" and the nightly run carries on. The
column set below is what the reader expects; it is waiting on the owner's
word-for-word confirmation.

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

**The columns are found by NAME, not by position.** A Form adds its own
timestamp column, the accountant may add another, and the columns may be
moved. The reader looks each one up by its heading, so a column that is
reordered does not break it. A column has to be spelled one of the names the
reader accepts — `SHEET_COLUMNS` in `lib/invoiceSheet.js` is the one list, and
it accepts a few natural synonyms (`Supplier` for `vendor`, `Bill No` for
`invoice_no`, `Paid On` for `payment_date`).

A heading is normalised before it is compared: lower case, and anything that
is not a letter or a digit becomes an underscore. So `Invoice No.`,
`invoice no` and `INVOICE_NO` all find the same column.

**The reader accepts the forms a Form produces.** A date may be `dd/mm/yyyy`
or `yyyy-mm-dd`; an amount may carry a rupee sign and thousands separators
(`₹ 12,500.00`); a payment state of `Paid`, `Settled` or `Cleared` is paid,
and `Pending`, `Unpaid` or `Due` is not.

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

The reading side exists (`lib/googleSheetsService.js` and
`lib/invoiceSheet.js`) but it needs a Google **service account**:

1. create a service account in Google Cloud and download its key;
2. share the Sheet with the service account's email, as **Editor** — the
   site's expense form writes a row into the sheet, so Viewer is not enough;
3. put the key on Vercel;
4. lock the sheet's columns so the labels cannot drift.

### The service account

There is already one, set up for the customer-feedback pull:

```
variable-pay-feedback-sync@my-project-27246-510206.iam.gserviceaccount.com
```

in the Google Cloud project `my-project-27246-510206`. **Reuse it** — do not
create a second one.

### Getting the key onto this machine

`scripts/petpooja-config.json` has the service account's address and a
`GOOGLE_PRIVATE_KEY_PATH` that points at the **office computer**
(`C:\Users\LENOVO\my-project-27246-510206-edce775e7ba3.json`). So the key is
not on the Mac, and a new one has to be downloaded.

Download a JSON key from Google Cloud and save it as:

```
scripts/google-service-account.json
```

That path is **gitignored**. A Google Cloud key file is JSON, not PEM — the
`private_key` inside it has to be read out and its `\n` put back, which is
what `scripts/google-sheet.mjs` does.

### The key on Vercel

`scripts/setup-google-sheets.sh` puts it there the same way the SMTP password
is done: read from a file, handed to `vercel env add` through stdin, so the
key never appears in a command line or in the shell history.

| variable | what it holds |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the service account's address |
| `GOOGLE_PRIVATE_KEY` | the private key, as the PEM content |

### The sheet's own settings

| variable | default | what it holds |
|---|---|---|
| `INVOICE_SHEET_SPREADSHEET_ID` | `GOOGLE_SHEETS_SPREADSHEET_ID` | which spreadsheet |
| `INVOICE_SHEET_NAME` | `Invoices` | which tab |
| `INVOICE_SHEET_RANGE` | `A:K` | which columns |

The customer-feedback sheet uses the `GOOGLE_SHEETS_*` names, so the invoice
sheet has its own — one service account can open both.

### Reading and writing the sheet from here

```
node scripts/google-sheet.mjs list
node scripts/google-sheet.mjs read [spreadsheetId] [--sheet <tab>]
node scripts/google-sheet.mjs append <spreadsheetId> --tab <tab> --row '<json>'
```

`list` is the "is my connection working?" check. `read` prints the headings
and the rows **with the column letters**, so a layout can be read off instead
of guessed at.

## How it runs

`POST /api/sync?sheet=1` — its own request, with the shared sync secret.
It needs no browser and no Petpooja login, so it takes about a second and
cannot affect the Petpooja groups. The nightly workflow calls it once,
after the report groups.

**A sheet that is not set up yet is not a failure.** Without the key the
request answers `{"ok": true, "skipped": true}` and the nightly run carries
on. A sheet that is set up but broken answers HTTP 500, so the scheduler
retries it.

## Composio does not work here — do not go back to it

The desktop app has a Composio MCP server registered, but **it connects with
zero tools**. The app launches `@composio/mcp@1.0.9` with no arguments; the
package has no default command, so it prints its usage text and exits:

```
[mcp:composio:stderr] You need to specify a command
```

It needs `start --url <sse-url>`, and the URL lives in the app's account-side
settings — the local connection key is a one-way hash
(`project:f7c41bdd…`), so the endpoint cannot be reconstructed from this
machine. Confirmed three ways: the runtime's own error, `mcp-runtime-names.json`
(composio → 0 tools), and the connector catalogue (no Google tools).

**Use the service account instead.** It is the credential production runs on,
it needs no personal connector to stay connected, and it can read *and* write
— which the nightly pull and the site's expense form both need.

Related: [[finance-calendar-month]], [[finance-salary-and-standing-costs]],
[[petpooja-hosted-sync]]
