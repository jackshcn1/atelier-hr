-- Migration: Add adhoc payroll support and prior payout deduction tracking
-- Created: 2026-09-26

-- 1. Add run_type to payroll_runs
alter table payroll_runs
  add column if not exists run_type text default 'regular' check (run_type in ('regular', 'adhoc', 'exit')),
  add column if not exists notes text;

-- 2. Add prior payouts deduction tracking to payroll_line_items
alter table payroll_line_items
  add column if not exists prior_payouts_deduction numeric default 0,
  add column if not exists prior_payouts_notes text;
