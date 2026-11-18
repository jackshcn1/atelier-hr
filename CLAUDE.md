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
   - Finance (`/finance`) — the four finance modules, on the calendar month
   - Costs & Expenses (`/finance/costs`) — revenue channels and the cost breakdown
   - New Expense (`/finance/costs/new`) — the accountant's entry form: variable / fixed / petty, with the supplier as a type-ahead that can add a new supplier. It writes a row into the accountant's Google Sheet, and the sheet is pulled into the books
   - Bill Entry (`/finance/costs/entry`) — log a bill by hand (the fallback path): the category follows the kind of cost (fixed = the standing costs, closed; variable = the moving costs + Other), the supplier is a type-ahead that can add a new supplier, and the invoice itself can be attached — the file goes into the restaurant's Drive folder and the bill keeps the link
   - Standing Costs (`/finance/costs/fixed`) — the expected monthly costs; the month's invoice replaces the expected amount
   - Petty Cash (`/finance/costs/petty`) — Cash entry (money in) or Expense (money out)
   - Bills (`/finance/bills`) — what the restaurant owes its suppliers, bill by bill
   - Suppliers (`/finance/vendors`) — the supplier list, with what is owed to each
   - Cashflow (`/finance/cashflow`) — the month's cash movements and the money owed by customers
   - P&L (`/finance/pnl`) — the statement for the calendar month

6. **Standalone Links**
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

## Security & Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` — Public Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Public anon key (JWT starting with `eyJ...`)
- `SUPABASE_SERVICE_ROLE_KEY` — Protected server-side secret key (used strictly in backend routes and local sync scripts)

**Last Updated**: 2026-11-18 — Completed:
- **Finance Module (calendar month)**: Revenue from Petpooja's Executive Sales Summary for the plain calendar month (separate from the 20–19 pay cycle), a real P&L (revenue → cost of revenue → gross profit → operating costs → net), bills and suppliers from the Petpooja purchase reports, receivables from the due-payment report, cashflow, and a readiness list that names what is still missing. Purchase returns are credit notes and reduce cost of purchases. See `memory/finance-calendar-month.md`.
- **Staff Salary as an Operating Cost**: The pay cycle that *ends* in the month is the one that counts. Until that cycle's regular payroll run exists, the salary is a forecast frozen at the 1st of the month after the cycle ends; once it exists, the real payroll figure replaces it. Advances are cash out, not cost. Variable pay is not forecast. See `memory/finance-salary-and-standing-costs.md`.
- **Standing Costs as a Checklist**: The standing-cost list holds the *expected* amount; the month's invoice replaces it rather than adding to it, so nothing is counted twice. Category matching, monthly/annual cycles, and a Received / Expected-amount-used status on the page.
- **Accountant Invoice Sheet**: A Google Sheet is the only place an amount is written. The sheet is a Google Form's response sheet with **three blocks of columns** — variable, fixed and petty — and the "Type of Expense" column says which block an entry is in. The reader (`lib/invoiceSheet.js`) finds every column by its heading, reads the three date shapes the sheet uses, and pulls it nightly as `POST /api/sync?sheet=1` or on demand with `node scripts/import-invoice-sheet.mjs`. A row is identified by its own `source_key` — the Entry ID, or the Form's timestamp for a row typed by hand — so a corrected amount still finds the same bill. The site's entry form writes into the sheet and then runs the same pull. Column design and the four anti-double-count rules in `memory/finance-invoice-sheet.md`.
- **Onboarding Workflow**: 5-stage gating (`Draft` → `Documents Pending` → `Compensation Set` → `Assets Issued` → `Active`), standing legal/compliance terms auto-compiler with merge fields, instant A4 PDF agreement generator, and mandatory Day 1 physical signature verification gate.
- **Executive Employee Dossier**: Segmented tabbed profile layout (`Job & Hierarchy`, `Personal & ID`, `Compensation & Slips`, `Assets & Facilities`, `Compliance & Training`, `Notes & Record`, `Exit & Offboarding`), interactive 1:1 square photo cropper with zoom/pan, unified asset inventory with deposit status, and full multi-section master record print dossier.
- **Recruitment Pipeline**: Atelier design system layout with headcount positions, active pipeline tracking, candidate evaluation scoring, and stage transitions.
- **Exit Clearance & Resignation Gateway**: Mandatory resignation letter upload gate to move employees to "Serving Notice Period" (`on-notice`), mandatory exit clearance checklist completion gate before marking employees as "Exited Staff" (`status = exited`), statutory Gratuity auto-calculation formula (`(15 * Basic+DA * Years) / 26` with 5-year floor), deposit refund tracking with refund dates and toggles, asset tag serial verification, and full lifetime exit archive embedded into the personnel dossier.
- **Bill Entry with the Invoice Attached**: A bill typed in by hand can have the invoice itself attached — a PDF or a photograph, up to ten megabytes — which goes into the restaurant's own Google Drive folder and is kept as a link on the bill. A bill that came in through the accountant's sheet carries its attachment the same way, so **See the invoice** works on the bills page for those too. `lib/googleDrive.js` does the upload; the Drive API has to be switched on in the Google Cloud project. **The upload is made as the restaurant's own Google account, not as the service account** — Google gives a service account no Drive storage of its own, so a file it creates is refused with "Service Accounts do not have storage quota". The account connects once through Google's own sign-in (`Settings → Google Drive`), and only the refresh token is kept, in `google_drive_tokens` (RLS on, no policies). The invoice is then **served by the site** (`/api/finance/expenses/invoice/[id]`), so anyone signed in can open it — Drive's own link would turn away a colleague whose Google account is not the connected one. The file id is looked up from the bill, never taken from the request.
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
