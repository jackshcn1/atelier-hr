-- Migration: Variable Pay Tracker RLS & Privacy Policies
-- Created: 2026-09-28

-- 1. Helper function to get current user's linked employee_id
create or replace function public.my_employee_id() returns text as $$
  select employee_id from public.profiles where id = auth.uid();
$$ language sql security definer;

-- 2. Update RLS policies on variable_metric_inputs
-- Regular employees can read their own individual rows or team-wide rows (employee_id is null)
-- Admins and managers with view_payroll or view_employees can read all rows
drop policy if exists "vmi_select" on public.variable_metric_inputs;

create policy "vmi_select" on public.variable_metric_inputs for select
  using (
    is_admin()
    or has_permission('view_payroll')
    or has_permission('view_employees')
    or employee_id is null
    or employee_id = my_employee_id()
  );

-- 3. Ensure employees can read active and locked variable_pay_periods
drop policy if exists "vpp_select" on public.variable_pay_periods;

create policy "vpp_select" on public.variable_pay_periods for select
  using (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
