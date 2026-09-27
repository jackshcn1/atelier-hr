-- Migration: Add employee portal RLS policies
-- Created: 2026-09-26

-- 1. Allow employees to read their own employee record
create policy "employees_self_select" on employees for select
  using (
    lower(email) = lower(auth.jwt() ->> 'email')
    or phone = auth.jwt() ->> 'phone'
  );

-- 2. Allow employees to read their own payroll line items
create policy "payroll_line_items_employee_select" on payroll_line_items for select
  using (
    is_admin() or
    exists (
      select 1 from employees e
      where e.employee_id = payroll_line_items.employee_id
      and (lower(e.email) = lower(auth.jwt() ->> 'email') or e.phone = auth.jwt() ->> 'phone')
    )
  );

-- 3. Allow employees to read parent payroll runs for their line items
create policy "payroll_runs_employee_select" on payroll_runs for select
  using (
    is_admin() or
    exists (
      select 1 from payroll_line_items pli
      join employees e on e.employee_id = pli.employee_id
      where pli.payroll_run_id = payroll_runs.id
      and (lower(e.email) = lower(auth.jwt() ->> 'email') or e.phone = auth.jwt() ->> 'phone')
    )
  );

-- 4. Allow all authenticated users to read payroll settings for payslip calculations
create policy "payroll_settings_read_all" on payroll_settings for select
  using (auth.role() = 'authenticated');
