-- Migration: Add detailed payroll calculation and payment processing fields
-- Created: 2026-09-26

-- 1. Add detailed calculation and payment fields to payroll_line_items
alter table payroll_line_items
  add column if not exists days_absent numeric,
  add column if not exists expected_hours numeric,
  add column if not exists actual_hours numeric,
  add column if not exists effective_days numeric,
  add column if not exists offs_paid numeric,
  add column if not exists total_paid_days numeric,
  add column if not exists per_day_salary numeric,
  add column if not exists fixed_pay numeric,
  add column if not exists variable_target numeric,
  add column if not exists variable_percent numeric,
  add column if not exists variable_pay numeric default 0,
  add column if not exists bonus_pay numeric default 0,
  add column if not exists bonus_description text,
  add column if not exists deduction_amount numeric default 0,
  add column if not exists deduction_reason text,
  add column if not exists total_pay numeric,
  add column if not exists payment_status text default 'pending',
  add column if not exists salary_paid_date date,
  add column if not exists bank_reference_number text,
  add column if not exists payslip_number text,
  add column if not exists processed_at timestamptz,
  add column if not exists processed_by text;

-- 2. Add period and status metadata to payroll_runs
alter table payroll_runs
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists status text default 'finalized',
  add column if not exists total_amount numeric;
