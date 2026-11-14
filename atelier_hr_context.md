# Atelier HR / ERP - Comprehensive System Context & Business Logic

## 1. Project Overview & Tech Stack
- **Application**: All-in-one HR administration, operations, and payroll platform for restaurant Atelier.
- **Frontend / Backend**: Next.js (App Router)
- **Database / Auth / Storage**: Supabase (PostgreSQL, RLS enabled, Storage for uploads)
- **Hosting**: Vercel (Auto-deploys from GitHub main branch)
- **Integration**: Petpooja POS (Attendance and hours synchronization)

---

## 2. Core Business Logic (DO NOT MODIFY WITHOUT APPROVAL)

### A. Payroll Engine Rules
- **Cycle**: 20th of previous month to 19th of current month (Paid on 1st of following month).
- **Per-day salary**: Fixed salary ÷ Total calendar days in period.
- **Standard Hours**: 10 hours/day (Exception: Employee ID 15 "Nayana" = 9 hours).
- **Weekly Offs**: 4 paid weekly offs per month. Unused offs are forfeited, not paid extra. Overtime is not paid.
- **Effective Days**: Total hours worked ÷ Standard hours/day, rounded to nearest whole day, capped at days actually marked present.
- **Weekly Off Loss Rule**: Lost in blocks of 7 absent days beyond the 4-day allowance (e.g., 5-11 extra absent = -1 off, 12-18 = -2, etc.).

### B. Salary Split Rules (Kerala Minimum Wage & Indian Compliance)
- **Fixed Salary ≤ ₹18,000/month**: No split, entire amount = Basic + DA (Kerala minimum wage floor).
- **Fixed Salary > ₹18,000/month**: Basic + DA fixed at ₹18,000 floor, remainder split into HRA and other allowances.
- **Application**: Forward-only; changes apply to future salary entries, not retroactively.

### C. Variable Pay Incentive Engine
- **Structure**: Fixed monthly amount per employee (pool) distributed based on weighted metrics summing to 100%.
- **Attainment Formulas**:
  - *Binary (Hit/Miss)*: Higher is better (`actual >= target ? 100% : 0%`); Lower is better (`actual <= target ? 100% : 0%`).
  - *Proportional (Scaled)*: Scaled between floor, target, and ceiling. Overachievement allowed up to ceiling cap.
- **6 Configured Schemes**:
  1. `service_captain`: Sales (40%), Google Reviews (20%), Pax Avg (20%), Grooming (10%), Service Quality (10%).
  2. `service_helpers`: Team Sales (70%), Grooming (20%), Service Quality (10%).
  3. `kitchen`: Food Quality (30%), Prep Time (20%), Wastage (20%), Kitchen Hygiene (20%), Grooming (10%).
  4. `b2b_counter`: B2B Revenue (40%), New Clients (20%), Debit Notes (20%), Credit Recovery (10%), Counter Sales (10%).
  5. `housekeeping`: Cleaning Checklist (60%), Cleanliness Feedback (20%), Breakage (20%).
  6. `accounting`: Cash/Card Reconcile (50%), Delivery Sales (30%), GST Filing (20%).

---

## 3. Architecture & Navigation Hierarchy
1. **Employees**: Directory (`/employees`), Profile management, Onboarding (5-stage gating, auto-compiled legal terms, A4 PDF agreement generator), Org Chart (`/orgchart`).
2. **Operations**: Checklists (`/checklists`), Tasks (`/tasks` with subtasks, deliverables, audit logs).
3. **Payroll**: Payroll processing (`/payroll`), Bank payments & UTR (`/payroll/processing`), My Variable Pay (`/my-variable-pay`), Company Attainment (`/payroll/variable-pay/attainment`), Payslips (`/payslips`).
4. **Documents**: SOPs (`/documents?category=sop`), Training (`/documents?category=training`), Targets, Company Policies.
5. **Standalone**: Export (`/export`), Settings & User Management (`/settings/users` with custom permissions & role presets).

---

## 4. Security & Governance Rules
- **Supabase Service Key**: NEVER expose `SUPABASE_SERVICE_ROLE_KEY` in chat, client-side code, or commits. Keep in environment variables only.
- **RLS & Backups**: Always verify Row Level Security policies on schema updates; take Supabase backups before schema alterations.
- **Plain-English Explanations**: User is a non-technical restaurant owner; explain technical changes, risks, and steps clearly before executing.
