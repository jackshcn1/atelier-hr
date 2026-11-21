# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key Development Commands

### Core Next.js Commands
- **`npm run dev`** - Start local development server (next dev)
- **`npm run build`** - Build app for production (next build)  
- **`npm run start`** - Start production server (next start)
- **`next dev`** - Local development (same as `npm run dev`)

### Payroll & Sync Scripts
- **`node scripts/petpooja-sync.mjs`** - Automated Petpooja variable pay sync engine (runs locally on office computer)
- **`node scripts/setup-petpooja.mjs`** - One-time setup for Petpooja credentials

### Common Operations
- **Preview deployment** - Vercel automatic builds on push to `main` branch
- **Supabase operations** - Direct SQL in Supabase dashboard, or migrations in `supabase/migrations/`

## High-Level Architecture

**Atelier HR** is a comprehensive Internal HR administration & Employee Self-Service tool with complex domain logic.

### Navigation Architecture & Route Hierarchy

Navigation is grouped into 4 functional dropdown families + standalone links:

1. **Employees**
   - Employees (`/employees`) — Employee directory, profile view/edit, onboarding
   - Org Chart (`/orgchart`) — Hierarchical team structure

2. **Operations**
   - Checklists (`/checklists`) — Daily opening/closing and hygiene checklists
   - Tasks (`/tasks`) — Delegated accountability tasks and assignments

3. **Payroll**
   - Payroll (`/payroll`) — Attendance processing & monthly calculation
   - Salary Processing (`/payroll/processing`) — Bank payment processing, narration & UTR logging
   - My Variable Pay (`/my-variable-pay`) — Individual employee scorecard, live progress & target attainment (with manager switcher for admins)
   - Attainment (`/payroll/variable-pay/attainment`) — Admin-only company-wide attainment overview table & snapshot regeneration
   - Payslips (`/payslips` / `/my-payslips`) — Payslip directory & individual slip view

4. **Documents**
   - SOPs & Workflows (`/documents?category=sop`)
   - Training Material (`/documents?category=training`)
   - Variable Pay Targets (`/documents?category=targets`)
   - Company Policies (`/documents?category=policy`)

5. **Finance**
   - Finance (`/finance`) — the six finance modules, on the calendar month
   - **Invoice Entry (`/finance/invoice-entry`) — the one page a biller needs.** It shows nothing else in Finance: no costs, no forecast, no profit. There is **one form** for every bill:
     - **Enter a Bill** (the form on the page itself): variable or fixed, what it was for (fixed = the standing costs, a closed list; variable = what the sheet already uses, typed or picked), the supplier as a type-ahead that can add a new supplier, the amount, the invoice date, the invoice number, the paid-on date, **how it was paid** (UPI, cash, a transfer — or anything typed) and **the bank's reference for it** (the UTR), **the invoice itself attached**, and a description. It writes a row into the accountant's Google Sheet, and the sheet is pulled into the books — so the sheet is the record and there is one way into the books. **The same bill cannot be entered twice**: the sheet is read first, and a bill already there (same supplier and invoice number, or same supplier, amount and date when there is no invoice number) is refused with a message that names it.
     - **Petty Cash** (`/finance/invoice-entry/petty`) — Cash entry (money in) or Expense (money out). It is a float with a balance of its own, so it is entered on its own page.
     - The old paths (`/finance/invoice-entry/bill`, `/finance/invoice-entry/expense`, `/finance/costs/entry`, `/finance/costs/new`, `/finance/costs/petty`) redirect here.
   - Costs & Expenses (`/finance/costs`) — revenue channels and the cost breakdown against the month's forecast, for one calendar month or for the last 3, 6 or 12 months (`?range=N`). **Bills and Suppliers are not here** — they live in the Finance overview, one place for each.
   - Standing Costs (`/finance/costs/fixed`) — the expected monthly costs; the month's invoice replaces the expected amount
   - Bills (`/finance/bills`) — what the restaurant owes its suppliers, bill by bill. Filtered by a **month** (the window Petpooja reports on) or by a **custom period** — any span of days (`lib/financeBills.js`)
   - Suppliers (`/finance/vendors`) — the supplier list, with what is owed to each
   - Cashflow (`/finance/cashflow`) — the month's cash movements and the money owed by customers
   - P&L (`/finance/pnl`) — the statement for the calendar month

6. **Customers**
   - Customers (`/customers`) — the module's landing page: four cards, like Finance and Operations
   - Overview (`/customers/overview`) — the whole picture in one screen: order value, the gap (value with no contact number), month by month, the most valuable customers, and the ones worth calling back
   - All Customers (`/customers/list`) — everyone on the books, searchable and sortable; numbers are shown masked here and in full on the customer's own page
   - Customer (`/customers/[phone]`) — one customer: their orders, their reviews, their feedback responses
   - Reviews (`/customers/reviews`) — every review from Zomato and Swiggy, by platform, with the rating month by month
   - Feedback (`/customers/feedback`) — the feedback form answered: each question rated, the tags people chose, the waiter they were about
   - **A customer is a person whose order carried a real contact number** — the phone is the unique code, so nobody is counted twice. An order with no number is not discarded; it is counted in the gap. See `memory/customer-section.md`.

7. **Standalone Links**
   - Export (`/export`) — CSV data download
   - Settings (`/settings`) — System configuration, departments, and user management (`/settings/users`)
   - Privacy Policy (`/privacy`) — **public**, outside the login gate: Google's OAuth consent screen asks for a privacy policy URL, and a policy behind a login is no policy
   - Terms of Service (`/terms`) — **public**, for the same reason

### Design System (Atelier Theme)
- **Typography**: Newsreader (Editorial Serif) for titles/figures, Inter for UI text
- **CSS Utility Classes** (in `app/globals.css`):
  - `.page-head`, `.page-title`, `.page-purpose`
  - `.panel`, `.panel-body`, `.panel-title`, `.hairline-list`
  - `.btn-primary`, `.btn-secondary`, `.btn-quiet`, `.btn-danger`
  - `.field`, `.field-label`
  - `.table-head`, `.table-cell`
  - `.pill-good`, `.pill-warn`, `.pill-bad`, `.pill-quiet`
  - `.figure`, `.figure-label`, `.note`

### User Management & Authentication Architecture
- **API Endpoint**: `POST /api/admin/create-user` handles creating users in Supabase Auth via `auth.admin.createUser` and creates their `profiles` row with the chosen preset (Employee, Department Head, HR Manager, Super Admin), department scope, and custom permissions in 1 step.
- **Access Status**: Users can be marked `active` or `revoked`/`inactive` from the UI.
- **Super Admin Protection**: Only super admins can create or promote accounts to `super_admin`.

### Key Files & Responsibilities
- `app/components/Navbar.js` - Dropdown navigation (desktop) + collapsible drawer (mobile)
- `app/my-variable-pay/page.js` - Individual variable pay scorecard and manager employee selector
- `app/payroll/variable-pay/attainment/page.js` - Company-wide variable pay attainment table
- `app/settings/users/page.js` - User management, permission configurator, role presets, and add user drawer
- `app/api/admin/create-user/route.js` - Backend admin user creation API
- `app/documents/page.js` - Documents hub with query param tab selection
- `lib/financeForecast.js` - The forecast on the Costs & Expenses page: the level of a normal month, the festival factors, the variable cost ratio, and the months on record it is built from
- `app/components/FinanceDashboard.js` - The Costs & Expenses page: the forecast bars, the actual against forecast totals, and the month-by-month panel
- `app/customers/page.js` - The Customer module's landing page: four cards, one per sub-module
- `app/api/customers/route.js` - The Customer section's reads, dispatched on `view`: overview, list, detail, reviews, feedback. The reviews and the feedback are worked out once, in `buildReviewPicture()` and `buildFeedbackPicture()`, so the overview and their own pages can never disagree
- `lib/customerParsers.js` - Reading Petpooja's orders and ratings exports and the feedback sheet, the phone rule, and the two joins
- `lib/customerSync.js` - The nightly pull: a month of orders at a time, a day of reviews at a time, each chunk checked against the source's own count before it is written

## Security & Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` — Public Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Public anon key (JWT starting with `eyJ...`)
- `SUPABASE_SERVICE_ROLE_KEY` — Protected server-side secret key (used strictly in backend routes and local sync scripts)

**Last Updated**: 2026-11-21 — Completed:
- **The Customer Section Is a Module Now**: the Customer section was one long page, which is not how Finance, HRMS or Operations open. `/customers` is now a **landing page of four cards** — Overview, All Customers, Reviews, Feedback — and the dashboard moved to `/customers/overview`. The reviews and the feedback each have a page of their own: `/customers/reviews` lists every review with a platform filter (All 420 · Zomato 280 · Swiggy 140) and the rating month by month, and `/customers/feedback` rates each of the form's six questions, lists the tags people chose, names the waiter they were about, and shows every response as it was written. The overview keeps the headline of both and links to them. The nav has four entries, and `isLinkActive()` needed two special cases: the landing page lights nothing, and "All Customers" also lights on a customer's own page. The reviews and the feedback are worked out **once**, in `buildReviewPicture()` and `buildFeedbackPicture()`, so the overview and their own pages can never disagree. The landing page's card grid is two columns, not four — four across was tried and the card subtitles wrapped at 1280px. See `memory/customer-section.md`.

**Previously Updated**: 2026-11-20 — Completed:
- **How a Bill Was Paid, and the Bank's Reference for It**: a bill that was paid before it was typed in — a UPI transfer on the 18th, entered on the 20th — carried no trace of the payment beyond the date. The sheet gained two more columns (**X Payment Mode**, **Y Bank Reference**), the bill form asks for both, and they travel through the sheet into `expenses.payment_mode` and `expenses.bank_reference` — so the Bills page can say *"Paid by UPI · UTR-44921"*. The bank reference stands in for the invoice number when there is no UTR, so the column is never empty and the two are never mixed up. A petty entry carries neither: cash out of a drawer has no bank reference.
- **One Bill Form, Not Two**: "Log a Bill by Hand" and "New Expense" were two forms for the same job, and neither had ever been used — of 2,422 bills in the books, **19 came in through the accountant's Google Form and 0 through the site's own forms**. They are now **one form** on `/finance/invoice-entry`: variable or fixed, what it was for, the supplier, the amount, the dates, **the invoice itself attached**, and a description. It writes into the accountant's sheet and the sheet is pulled into the books, so the sheet stays the complete record and there is one way into the books. The direct-write endpoint (`POST /api/finance/expenses`) is **retired** — it answers 405 and says where bills are entered. The sheet gained a **Description** column (W) and the attachment link now travels through the sheet's own attachment columns (G for variable, L for fixed). **The same bill cannot be entered twice**: the sheet is read before the row is written, and a bill already there — same supplier and invoice number, or same supplier, amount and date when there is no invoice number — is refused with a message that names it. The sheet's columns are found **by heading**, so the whole tab is read (`A:AZ`) rather than a fixed range that could stop one column short and lose a bill. The old paths (`/finance/invoice-entry/bill`, `/finance/invoice-entry/expense`, `/finance/costs/entry`, `/finance/costs/new`) redirect to the one form; petty cash keeps its own page, because a float with a balance is not a bill. See `memory/finance-invoice-sheet.md`.
- **A Forecast on the Costs & Expenses Page**: the bars used to show each figure's share of the month's total, which answered a question nobody asked. They now fill with the **actual against the month's forecast** — if the month was forecast at ₹1,00,000 and ₹40,000 has come in, the bar is 40% full — with a marker showing where the month should have reached by now, so a bar that is behind can be told apart from one that is simply early. The forecast is worked out in `lib/financeForecast.js` from the months on record: a **level** (the median of each channel's complete months, with that month's festival effect taken out), a **season factor** per calendar month from the Kerala and Indian festival calendar (August 1.10 for Onam, November 1.05 for Deepavali, **December 1.30 for Christmas**), a **variable cost ratio** taken over the last four complete months (the share has been falling as the business grew), the standing-cost list for fixed costs, ₹15,000 a month for petty cash, and the payroll's own frozen forecast for salary. **The method was tested against July–October 2026, where the answer is already known: 5.6% revenue error with the festival factors against 9.5% without them, and 14.8% cost error against 20.3% over every month on record.** Total revenue and total costs now show actual against forecast, and a **"Month by month against the forecast"** panel runs from March 2026 to the month ahead, with a running month shown as it is *heading* rather than as it stands. A month in progress is measured against what it should have reached by now — but the standing costs and the salary are not, because they are booked for the whole month on the first day. **December rests on the festival calendar alone**: there is no December on record to learn it from, and the page says so. See `memory/finance-forecast.md`.
- **The Twice-Weekly Purchase Refresh**: Petpooja lets a bill be edited or cancelled up to 90 days after its date, but the nightly sync only pulls the pay cycle that is running — so the books drift. A **separate workflow** (`.github/workflows/petpooja-refresh.yml`, Monday and Thursday at 05:00 IST) re-reads the last 90 days of purchases with `?refresh=90`. It may pull **only** the purchase reports (the sales report would rewrite a closed month's revenue; the receivables report is already fresh every day), it **forces finance-only on itself**, and it names its own window. It puts right a bill Petpooja has added, an amount that was corrected, a payment recorded in Petpooja, a bill that was cancelled, and a bill Petpooja has **deleted** — the last one with **two strikes**, because a deleted document leaves no trace and a single odd export must never remove a good bill (`finance_purchase_refresh_misses`). Every refresh says what it found: *"668 bills in Petpooja's report, 670 in the books, 668 matched, 0 missing, 1 extra, 0 mismatched."* See `memory/petpooja-purchase-refresh.md`.
- **A Cancelled Petpooja Document Is Not a Bill**: The Purchase List the sync reads keeps **cancelled** documents, and their payment column says "Unpaid" — because a cancelled document was never paid. Petpooja's own Purchase Report leaves them out, so every cancelled document came into the books as money the restaurant owes for goods never bought: **42 bills worth ₹1,80,708.74 and 6 debit notes worth ₹5,816**, all removed on 19 Nov 2026. `lib/expenseParsers.js` skips a cancelled document and hands it back so `removeCancelledBills()` in the sync can take it out of the books; a cancelled document that was entered again under the same number is one bill, and the live one is kept. May 2026 now matches Petpooja exactly (115 bills, all paid, ₹5,69,260, 0 due), and a full 1 Mar – 30 Nov pull reconciles bill for bill — 2,159 in the report, 2,159 in the books, 0 missing, 0 mismatched. See `memory/petpooja-cancelled-documents.md`.
- **A Read That Counts Every Row**: The database answers a read with at most a thousand rows and says nothing when it stops, so the bills page and the supplier page were quietly showing a fraction of the bills and a fraction of what was owed. `readAllRows()` in `lib/supabaseServer.js` pages a query that says "every row"; it is used by the bills route, the supplier route and the month's cost window. A paged read must be **ordered**, or a row can be served twice and another missed. Two checks hold it in place. See `memory/finance-thousand-row-rule.md`.
- **Bills by Month**: The bills page has a month dropdown, so one month can be set beside the same window in Petpooja and compared bill for bill.
- **Finance Module (calendar month)**: Revenue from Petpooja's Executive Sales Summary for the plain calendar month (separate from the 20–19 pay cycle), a real P&L (revenue → cost of revenue → gross profit → operating costs → net), bills and suppliers from the Petpooja purchase reports, receivables from the due-payment report, cashflow, and a readiness list that names what is still missing. Purchase returns are credit notes and reduce cost of purchases. See `memory/finance-calendar-month.md`.
- **Staff Salary as an Operating Cost**: The pay cycle that *ends* in the month is the one that counts. Until that cycle's regular payroll run exists, the salary is a forecast frozen at the 1st of the month after the cycle ends; once it exists, the real payroll figure replaces it. Advances are cash out, not cost. Variable pay is not forecast. See `memory/finance-salary-and-standing-costs.md`.
- **Standing Costs as a Checklist**: The standing-cost list holds the *expected* amount; the month's invoice replaces it rather than adding to it, so nothing is counted twice. Category matching, monthly/annual cycles, and a Received / Expected-amount-used status on the page.
- **Accountant Invoice Sheet**: A Google Sheet is the only place an amount is written. The sheet is a Google Form's response sheet with **three blocks of columns** — variable, fixed and petty — and the "Type of Expense" column says which block an entry is in. The reader (`lib/invoiceSheet.js`) finds every column by its heading, reads the three date shapes the sheet uses, and pulls it nightly as `POST /api/sync?sheet=1` or on demand with `node scripts/import-invoice-sheet.mjs`. A row is identified by its own `source_key` — the Entry ID, or the Form's timestamp for a row typed by hand — so a corrected amount still finds the same bill. The site's entry form writes into the sheet and then runs the same pull. Column design and the four anti-double-count rules in `memory/finance-invoice-sheet.md`.
- **Onboarding Workflow**: 5-stage gating (`Draft` → `Documents Pending` → `Compensation Set` → `Assets Issued` → `Active`), standing legal/compliance terms auto-compiler with merge fields, instant A4 PDF agreement generator, and mandatory Day 1 physical signature verification gate.
- **Executive Employee Dossier**: Segmented tabbed profile layout (`Job & Hierarchy`, `Personal & ID`, `Compensation & Slips`, `Assets & Facilities`, `Compliance & Training`, `Notes & Record`, `Exit & Offboarding`), interactive 1:1 square photo cropper with zoom/pan, unified asset inventory with deposit status, and full multi-section master record print dossier.
- **Recruitment Pipeline**: Atelier design system layout with headcount positions, active pipeline tracking, candidate evaluation scoring, and stage transitions.
- **Exit Clearance & Resignation Gateway**: Mandatory resignation letter upload gate to move employees to "Serving Notice Period" (`on-notice`), mandatory exit clearance checklist completion gate before marking employees as "Exited Staff" (`status = exited`), statutory Gratuity auto-calculation formula (`(15 * Basic+DA * Years) / 26` with 5-year floor), deposit refund tracking with refund dates and toggles, asset tag serial verification, and full lifetime exit archive embedded into the personnel dossier.
- **Bill Entry with the Invoice Attached**: A bill typed in by hand can have the invoice itself attached — a PDF or a photograph, up to ten megabytes — which goes into the restaurant's own Google Drive folder and is kept as a link on the bill. The link travels through the accountant's sheet (the attachment column of the entry's own block), and the pull carries it into the books, so **See the invoice** works on the bills page for a bill entered by a biller and for one typed by the accountant alike. `lib/googleDrive.js` does the upload; the Drive API has to be switched on in the Google Cloud project. **The upload is made as the connected Google account, not as the service account** — Google gives a service account no Drive storage of its own, so a file it creates is refused with "Service Accounts do not have storage quota". The account connects once through Google's own sign-in (`Settings → Google Drive`), and only the refresh token is kept, in `google_drive_tokens` (RLS on, no policies). **Which account connects is a choice, not a fixed one**: it has to be able to write to the invoice folder, and it owns the files the site uploads. Connecting a separate admin account leaves the restaurant's own sensitive Google account completely untouched by the site. **Both Google credentials live in one dedicated Cloud project, `atelier-hr-drive`**, which holds nothing sensitive — the sensitive company project is out of the picture entirely. The **OAuth client** grants nothing by itself, and the token belongs to whoever signs in, so the company's own Drive is never in scope. The **service account** (`variable-pay-feedback-sync@atelier-hr-drive.iam.gserviceaccount.com`) reads and writes the accountant's sheet; it needs the **"ERP Website Files"** folder in the restaurant's Drive shared with it as Editor — sharing the folder covers both sheets and anything added to it later, and moving files does not change their ids. The invoice is then **served by the site** (`/api/finance/expenses/invoice/[id]`), so anyone signed in can open it — Drive's own link would turn away a colleague whose Google account is not the connected one. The file id is looked up from the bill, never taken from the request.
- **Personalized & Master Variable Pay Policy Documents**: Real-time customized variable pay target document (`/documents/my-variable-pay-target`) calculating dynamic Fixed vs Variable CTC ratios, weighted metric component rupee distributions, and an Executive Master Directory (`/documents/master-variable-pay-policy`) compiling all role-based schemes into a single real-time reference.

---
Audit Log — 2026-10-07
- Full site audit completed (page-to-page, button-to-button, code + UI).
- Code clean: no syntax errors; all variables used; inline-style pages (checklists/tasks) structurally sound.
- Design system consistent: serif titles (Newsreader), Inter UI, pill/badge/ panel/ button styles applied across settings, employees, recruitment, payroll, checklists, tasks, variable-pay, payslips.
- Button interactions verified by code inspection (handleOpenRun, handleSubmitRun, savePayroll, etc.). No broken references.
- Cleanup completed: active tasks + their comments/audit logs deleted; active checklist runs deleted; templates/recruitment interview checklists preserved; metrics refreshed.
- Mobile-first: responsive overflow controls added; flex/grid patterns verified.
- CLAUDE.md updated with audit findings.
