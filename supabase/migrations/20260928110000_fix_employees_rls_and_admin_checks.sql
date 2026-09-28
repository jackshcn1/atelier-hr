-- Migration: Fix Employees RLS Policies and Admin Role Checks
-- Created: 2026-09-28

-- 1. Ensure is_admin() covers super_admin, admin, and all elevated management roles
create or replace function public.is_admin() returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and (
      is_super_admin = true
      or role in ('super_admin', 'admin')
      or permissions->>'edit_employees' = 'true'
      or permissions->>'manage_users' = 'true'
      or permissions->>'manage_settings' = 'true'
    )
    and (access_status is null or access_status = 'active')
  );
$$ language sql security definer;

-- 2. Helper function: has_permission
create or replace function public.has_permission(perm_key text) returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and (access_status is null or access_status = 'active')
    and (
      is_super_admin = true
      or role in ('super_admin', 'admin')
      or (permissions->>perm_key)::boolean = true
    )
  );
$$ language sql security definer;

-- 3. Drop and recreate employees RLS policies
drop policy if exists "employees_select" on public.employees;
drop policy if exists "employees_write" on public.employees;
drop policy if exists "employees_update" on public.employees;
drop policy if exists "employees_delete" on public.employees;

create policy "employees_select" on public.employees for select
  using (
    is_admin()
    or has_permission('view_employees')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and (p.department_scope = 'all_departments' or p.department = employees.department)
    )
  );

create policy "employees_write" on public.employees for insert
  with check (
    is_admin()
    or has_permission('edit_employees')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and (p.department_scope = 'all_departments' or p.department = employees.department)
    )
  );

create policy "employees_update" on public.employees for update
  using (
    is_admin()
    or has_permission('edit_employees')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and (p.department_scope = 'all_departments' or p.department = employees.department)
    )
  );

create policy "employees_delete" on public.employees for delete
  using (
    is_admin() or has_permission('delete_employee')
  );

-- 4. Update exit_records RLS to allow managers to manage clearance
drop policy if exists "exit_records_admin" on public.exit_records;
create policy "exit_records_manage" on public.exit_records for all
  using (is_admin() or has_permission('edit_employees'));
