-- Migration: Make my_employee_id() work for employees without a profiles row
-- Created: 2026-09-30
--
-- Employees sign in to the HRMS with their own email address, but most of them
-- have no row in `profiles` (that table is mainly for admin/manager accounts).
-- The original helper only read profiles.employee_id, so it returned NULL for
-- those employees and the RLS policies that depend on it silently matched no
-- rows — an employee would see an empty variable pay dashboard.
--
-- Falling back to matching employees.email (the same lookup the UI already
-- performs) makes the self-service dashboards work for every employee.

create or replace function public.my_employee_id() returns text as $$
  select coalesce(
    (select p.employee_id
       from public.profiles p
      where p.id = auth.uid()
        and p.employee_id is not null),
    (select e.employee_id
       from public.employees e
      where lower(e.email) = lower(auth.jwt() ->> 'email')
        and e.deleted_at is null
      limit 1)
  );
$$ language sql security definer stable;

notify pgrst, 'reload schema';