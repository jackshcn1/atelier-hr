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
`?sheet=1`) and it has read the real sheet — the columns below are the sheet
as it is, not a guess. The service account is set up and the sheet is shared
with it, so the nightly pull reads it.

To pull it by hand: `node scripts/import-invoice-sheet.mjs`.

## The mechanic

A **Google Form** whose answers land in a Sheet — "Expense Entries
(Responses)", tab "Form Responses 1". The system reads the Sheet on the
nightly run and on demand, and the site's own expense form writes a row into
it. The Sheet is the record; the books follow it.

## The columns — as the sheet really is

The sheet is a **Form's response sheet**, so it has one row per entry and
**three blocks of columns**, and the entry's type decides which block holds
it. Column C ("Type of Expense") is the switch.

| | Column | What it holds |
|---|---|---|
| A | Timestamp | when the entry was made — **the row's identity** |
| B | Email Address | who filled the form |
| C | Type of Expense | `Variable Cost` / `Fixed Cost` / petty |
| D | Variable Cost Type | the category — Outlet Electricity, Gas, Waste Collection, Maintenance, Fire Extinguisher Service |
| E | Amount (Variable Cost) | |
| F | Date of Invoice (Variable Cost) | |
| G | Invoice Attachment (if available) (Variable Cost) | the invoice, on Drive |
| H | Invoice Paid on (ignore if not paid) (Variable Cost) | **empty means not paid** |
| I | Fixed Cost Type | Outlet Rent, Airtel Broadband Monthly, Digital Marketing Monthly, Pest Control, Internal Signage Rent |
| J | Amount (Fixed Cost) | |
| K | Date of Invoice (Fixed Cost) | |
| L | Invoice Upload (if available) (Fixed Cost) | |
| M | Invoice Paid on (ignore if not paid) (Fixed Cost) | |
| N | Petty expense or Cash top-up? | **Expense or Cash top-up** — a top-up is money *into* the float |
| O | Date (Petty Expense) | |
| P | Amount (Petty Expense) | |
| Q | Name of Recipient (only for expense) | the petty supplier |
| R | Purpose (only for expense) | |
| S | Voucher upload (only for expense) | |

The attachment column holds the invoice on Drive, and the pull carries that
link into the bill's **`invoice_attachment`** column — the same column a bill
uploaded through the site uses — so **See the invoice** works on the bills page
for a bill that came in through the Form. The bank reference stays the invoice
number, so the two are never mixed up.

### The four columns this system adds

| | Column | What it holds |
|---|---|---|
| T | Supplier | who the bill was paid to. **The Form has no supplier question for the variable and fixed blocks**, so this column is how the accountant says who it was — including for the entries that are already there. Until they do, the cost type stands in. Seven of the nineteen rows already name their supplier — Airtel, Sequire Pest Control and Triads, the three the books could prove. |
| U | Entry ID | the row's own identity, written by the site's form. A Form row has none, so the Timestamp stands in. |
| V | Invoice Number | the invoice number, when there is one. |
| W | Description | a line of what the bill was for. Written by the site's form; a Form row has none and falls back to "From the accountant invoice sheet". |

`scripts/setup-invoice-sheet.mjs` adds these columns to the tab.

**The columns are found by NAME, not by position.** The Form may add a
question, the accountant may add a column, and the columns may be moved. The
reader looks each one up by what its heading says, and a heading is
normalised first: lower case, and anything that is not a letter or a digit
becomes an underscore. `Amount (Variable Cost)` and `Amount (Fixed Cost)` are
different columns with the same word in them, and the reader tells them apart
by the block they name.

**Because the columns are found by name, the whole tab is read** (`A:AZ`) and
not a fixed range. A range that stopped one column short would lose that
column **quietly** — and a column that is lost is a bill that is lost. The
`INVOICE_SHEET_RANGE` variable that used to set that range has been removed
from the code and from the server.

**The reader accepts the forms a Form produces.** A date may be
`yyyy-mm-dd`, `April 24, 2026`, or `5/1/2026` — and the Form's own date
picker writes the **month first** ("3/31/2026" is on the sheet, and a 31
cannot be a month), so a slash date is read as month/day/year. An amount may
carry a rupee sign and thousands separators (`₹ 12,500.00`).

## What each type does

| Type | Where it lands |
|---|---|
| `Variable Cost` | the month's cost of revenue — electricity, gas, waste, maintenance |
| `Fixed Cost` | the month's standing costs — rent, pest control, broadband, marketing, signage |
| petty | the petty cash float — an **Expense** comes off it, a **Cash top-up** goes into it |

## The four rules that stop double counting

1. **A row is identified by its own key, not by what it says.** The key is
   the Entry ID this system writes, or — for a row typed in the Google Form —
   the moment the entry was made. The amount and the date are *not* part of
   it, because the accountant is allowed to correct those, and a bill must
   still be found after it has been corrected. Otherwise a correction would
   leave the old bill in the books and add the corrected one next to it.
2. **The type decides where an invoice lands.** Rent is fixed and electricity
   is variable, so they cannot both end up in the same place. This is the
   answer to "outlet rent shows in fixed and variable".
3. **The fixed-cost list stops holding amounts.** It becomes a list of the
   standing costs to remember — name, category, billing cycle — and the
   amount comes from the sheet. A standing cost with no row for the month
   reads as **"not received yet"**, not as a stale number from March. The
   sheet's cost type is matched to the standing cost by name, with the noise
   words left out: "Airtel Broadband Monthly" finds "Airtel Broadband",
   "Pest Control" finds "Sequire Pest Control".
4. **Salary is never typed.** It comes from HRMS, forecast then actual, so
   there is no "salary" type.

### Who wrote a row — the `source` column

`expenses` and `petty_cash_ledger` both carry a `source` column:

| value | who wrote it |
|---|---|
| `petpooja` | the Petpooja pull |
| `sheet` | the accountant's invoice sheet |
| `manual` | a person typing on the site |
| `existing` | written before the column existed |

It is what makes rule 1 work. The sheet **updates its own rows** and never
writes over anybody else's, and it never adds a second row for an invoice
number that is already in the books. The `source_key` column says *which*
sheet row a cost came from, and it is what finds that row again after a
correction. The Petpooja pull marks its own rows
`petpooja` every night, so the mark heals itself; a Petpooja bill that the
accountant also typed into the sheet ends up as the Petpooja row, whichever
arrived first.

The petty ledger has no invoice-number column, so a sheet petty entry keeps
its invoice number in `reference` — that is what makes it recognisable.

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
variable-pay-feedback-sync@atelier-hr-drive.iam.gserviceaccount.com
```

in the Google Cloud project `atelier-hr-drive` (number `187302776196`) — a
project of its own, with nothing sensitive in it. **Reuse it** — do not create a
second one. The old account in the sensitive company project
`my-project-27246-510206` is retired: its key was disabled, and the account
should be deleted.

The service account needs the **"ERP Website Files"** folder in the
restaurant's Drive shared with it as **Editor** (Viewer is enough to read, but
the site's expense form writes a row into the sheet). Sharing the folder covers
both sheets and anything added to it later:

```
https://drive.google.com/drive/folders/1bNDcGxKqEu5mILcHjqrwLHxnW42Eo2tL
```

### Getting the key onto this machine

The key is downloaded from Google Cloud and saved as:

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

The customer-feedback sheet uses the `GOOGLE_SHEETS_*` names, so the invoice
sheet has its own — one service account can open both.

### The site's own bill form

`/finance/invoice-entry` — **one form** for every bill. It was two forms
("Log a Bill by Hand" and "New Expense"), and **neither had ever been used**:
of the 2,422 bills in the books, 19 came in through the accountant's Google
Form and **0** through the site's own forms. One form is now the whole of it.

- **variable or fixed**; fixed picks the standing cost from the closed list,
  variable takes what the sheet already uses (typed, with suggestions)
- the **supplier is a type-ahead** over the supplier list: type, and the
  suppliers that match come up; a name that is not on the list can be added
  there and then, and it is on the list for next time
- the amount, the invoice date, the invoice number, the paid-on date
- **the invoice itself** can be attached — the link goes into the sheet's own
  attachment column for that block (G for variable, L for fixed) and the pull
  carries it into the books, so *See the invoice* works on the bills page
- a **description**, in the sheet's Description column

Submitting writes a row into the sheet and then pulls it into the books — the
same pull the nightly run does, so there is one way into the books. The row is
placed by **heading**, so a question added to the Form cannot shift it into
the wrong column.

**The same bill cannot be entered twice.** The sheet is read *before* the row
is written, and a bill already there is refused with a message that names it.
The bill is identified the way the books identify one: the **supplier and the
invoice number**; when there is no invoice number, the **supplier, the amount
and the date**. This matters because the sheet has two ways in — the
accountant's Form and this form — and a bill entered in both would be counted
twice.

**There is no way to write a bill straight into the books.** The old
`POST /api/finance/expenses` created bills (`source = 'manual'`) and is
**retired**: it answers `405` and says that bills are entered on the Invoice
Entry page. The endpoint still reads bills, and can still mark one paid.

**Petty cash is not entered here.** It is a float with a balance of its own, so
it lives on its own page — `/finance/invoice-entry/petty` — and writes
straight to the petty ledger.

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

## The service account cannot store files — the invoice upload is different

The service account reads and writes the **sheet** perfectly well. It cannot
**store a file**: Google gives a service account no Drive storage of its own,
so an upload it makes is refused with

```
Service Accounts do not have storage quota.
```

Sharing the invoice folder with it does not help — the folder is visible
(the account becomes an Editor on it), but the new file would still be owned
by the account, and there is nowhere to keep it. Google says the same in its
own message: use a shared drive, or OAuth delegation. **Neither is available
here** — this is a personal `gmail.com` account, so there is no shared drive
to make and no Workspace domain to delegate to.

So the invoice upload is made as **a Google account of the restaurant's own**:

| | |
|---|---|
| `lib/googleUserDrive.js` | the OAuth client, the consent link, the token, the upload |
| `app/api/google-drive/connect` | sends the person to Google's sign-in |
| `app/api/google-drive/callback` | swaps the code for a refresh token and keeps it |
| `app/api/google-drive/status` | says whether it is connected, and as which account |
| `google_drive_tokens` | the refresh token — RLS on, no policies, service key only |

### Two Cloud projects, on purpose

The **service account** and the **OAuth client** live in **different Google
Cloud projects**, and that is deliberate.

- The service account (in the project that holds the key) reads and writes the
  **sheets**. It is a machine identity; it owns nothing.
- The OAuth client (in its own project) is the **app's identity**. It grants
  nothing by itself — what grants Drive access is the *token*, and the token is
  issued to whoever signs in at the consent screen.

So the company Drive is never in scope: a project owner cannot mint a token for
another account, and the connected account is one whose Drive holds only what
the site needs. Everything outside the invoice folder is unreachable.

The **full `drive` scope** is broad for whichever account connects — it means
read and write over that account's whole Drive. Connect the narrowest account
that can do the job, and if the account is one whose Drive holds company
material, connect a different one instead.

The person connects once, in **Settings → Google Drive**. After that the
upload goes in as that account: the file is owned by the account, it lands in
the invoice folder, and the bill keeps the link.

The **scope** is the full `drive`, not the narrower `drive.file`, because the
invoice folder is the accountant's own — `drive.file` only sees files this
site created and could not write into that folder.

**The refresh token is the secret.** It is never sent to the browser, never
written to a log, and never committed. The access token is not stored at all:
it is fetched from the refresh token each time and thrown away.

**A "Testing" consent screen expires the refresh token after seven days.**
The consent screen has to be in **Production** status, with the restaurant's
account added as a **test user** — that is enough for one account, and it
does not need Google's verification.

To publish to Production, Google's new Auth Platform asks the consent screen
for **a homepage URL and a privacy policy URL**. The privacy policy is a real
public page on the site — `/privacy` — and the middleware lets it through
without a sign-in, because a policy behind a login is no policy.

**A dead connection says so.** Google turns the connection away with
`invalid_grant` when the token has expired or been revoked; the site forgets
the token and asks to connect again, rather than failing as a broken upload.

### Who can upload, and who can open the invoice

The connection is **one setting for the whole site**, not a personal one — one
row in `google_drive_tokens`. Every signed-in person can attach an invoice;
the upload is made with the restaurant's token, so the file is owned by the
connected account whoever pressed the button. Only the **Connect** button is
admin-only, because connecting hands the site read/write over that account.

The file is owned by the connected Google account, so **Drive's own link
turns away a colleague** whose Google account is not that one — and an
employee with no Google account cannot open it at all. So the site serves the
file instead: `/api/finance/expenses/invoice/[id]` looks the file id up
**from the bill** (never from the request) and streams it to whoever is
signed in. The bills page shows that link as **See the invoice**, and keeps
**Open in Drive** beside it for the person who owns the account.

Related: [[finance-calendar-month]], [[finance-salary-and-standing-costs]],
[[petpooja-hosted-sync]]
