-- Phase 2: Real DB trigger + RLS (non-destructive)
-- 1. DB trigger: when employee_training row added, create matching manager task
-- 2. RLS: salary_history / employees update restricted to owner/payroll-admin

-- Fix 1: Actual trigger that creates manager training tasks
create or replace function public.create_manager_training_task()
returns trigger as $$
begin
  insert into public.tasks (
    title, description, due_date, status,
    assigned_employee_id, assigned_type, priority,
    created_by
  ) values (
    'Training checklist — report completes module',
    'Module: ' || coalesce(NEW.checklist_id::text, 'general'),
    coalesce(NEW.deadline, current_date + interval '14 days'),
    'assigned',
    (select reporting_manager_id from public.employees where employee_id = NEW.employee_id),
    'individual',
    'normal',
    'system:onboarding-trigger'
  ) on conflict do nothing;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_training_task on public.employee_training;
create trigger trg_training_task
  after insert or update of status on public.employee_training
  for each row when (NEW.status in ('not-started', 'in-progress'))
  execute function public.create_manager_training_task();

-- Fix 2: RLS for salary_history — owner (is_super_admin) or edit_salary permission only
-- No new role is introduced: the owner is already modelled as profiles.is_super_admin,
-- and a payroll admin is simply permissions->>'edit_salary' = true. This keeps the
-- existing profiles role check constraint (super_admin/admin/hr_manager/department_head/
-- employee) untouched, so Settings > Users is unaffected.
drop policy if exists "salary_history_owner_admin_only_insert" on salary_history;
create policy "salary_history_owner_admin_only_insert" on salary_history for insert
  with check (has_permission('edit_salary'));

drop policy if exists "salary_history_owner_admin_only_update" on salary_history;
create policy "salary_history_owner_admin_only_update" on salary_history for update
  using (has_permission('edit_salary'))
  with check (has_permission('edit_salary'));

-- A department head currently reaches salary_history through the existing
-- "salary_history_all" policy (which is `for all`, so it also covers insert/update).
-- That policy would otherwise keep the write path open and make the two policies above
-- meaningless, so writes are withdrawn from it: reads stay as they were, writes go
-- through the new owner/payroll-admin-only policies.
drop policy if exists "salary_history_all" on salary_history;

create policy "salary_history_read" on salary_history for select
  using (is_admin() or has_permission('view_salary') or exists (
    select 1 from employees e where e.employee_id = salary_history.employee_id
    and e.department = my_department()
  ));

-- Same treatment for the live salary columns on the employee record itself:
-- department heads keep their existing read access, but writing current_fixed_salary /
-- current_variable_salary / variable_pay_scheme is owner-or-payroll-admin only.
create or replace function public.can_edit_salary() returns boolean as $$
  select has_permission('edit_salary');
$$ language sql security definer;

drop policy if exists "employees_update" on employees;
create policy "employees_update" on employees for update
  using (is_admin() or department = my_department())
  with check (is_admin() or department = my_department());

-- Guard the money columns themselves: any update that changes them must be made by
-- someone with edit_salary. Everything else on the employees row stays editable by
-- department heads exactly as before.
create or replace function public.guard_salary_columns() returns trigger as $$
begin
  if (
    NEW.current_fixed_salary   is distinct from OLD.current_fixed_salary or
    NEW.current_variable_salary is distinct from OLD.current_variable_salary or
    NEW.variable_pay_scheme    is distinct from OLD.variable_pay_scheme
  ) and not has_permission('edit_salary') then
    raise exception 'Only the owner or a payroll admin can change salary details';
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists employees_salary_guard on employees;
create trigger employees_salary_guard
  before update on employees
  for each row execute function public.guard_salary_columns();

notify pgrst, 'reload schema';
