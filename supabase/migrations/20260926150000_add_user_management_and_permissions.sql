-- Migration: Comprehensive User Management & Custom Permissions
-- Created: 2026-09-26

-- 1. Update role check constraint on profiles to allow all roles
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'hr_manager', 'department_head', 'employee'));

-- 2. Add fields to profiles table
alter table profiles
  add column if not exists employee_id text references employees(employee_id) on update cascade on delete set null,
  add column if not exists email text,
  add column if not exists department_scope text default 'own_department' check (department_scope in ('own_department', 'all_departments')),
  add column if not exists access_status text default 'active' check (access_status in ('active', 'revoked', 'inactive')),
  add column if not exists permissions jsonb default '{}'::jsonb,
  add column if not exists is_super_admin boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- 3. Mark primary admin account as protected Super Admin
update profiles
set
  is_super_admin = true,
  role = 'super_admin',
  department_scope = 'all_departments',
  access_status = 'active',
  email = 'ateliernextplate@gmail.com',
  permissions = '{
    "view_employees": true,
    "edit_employees": true,
    "view_sensitive_info": true,
    "view_salary": true,
    "edit_salary": true,
    "manage_track_record": true,
    "manage_training": true,
    "manage_documents": true,
    "view_payroll": true,
    "finalize_payroll": true,
    "process_payments": true,
    "view_all_payslips": true,
    "manage_settings": true,
    "export_data": true,
    "manage_users": true,
    "delete_employee": true,
    "reactivate_user": true,
    "edit_locked_bank_details": true
  }'::jsonb
where id = 'deeace0e-89de-4b2c-b51b-b436f16f44b7';

-- 4. Trigger / function to automatically create/sync a profile when an auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
declare
  matching_emp record;
begin
  select * into matching_emp from employees where lower(email) = lower(new.email) limit 1;

  if found then
    insert into public.profiles (id, employee_id, email, display_name, department, role, department_scope, access_status, permissions)
    values (
      new.id,
      matching_emp.employee_id,
      new.email,
      matching_emp.name,
      matching_emp.department,
      'employee',
      'own_department',
      'active',
      '{}'::jsonb
    )
    on conflict (id) do update
    set
      email = new.email,
      employee_id = matching_emp.employee_id,
      display_name = matching_emp.name,
      department = matching_emp.department;
  else
    insert into public.profiles (id, email, role, department_scope, access_status, permissions)
    values (new.id, new.email, 'employee', 'own_department', 'active', '{}'::jsonb)
    on conflict (id) do update set email = new.email;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- Recreate trigger on auth.users if not already present
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Helper function: is current user super admin or admin?
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and (is_super_admin = true or role in ('super_admin', 'admin') or permissions->>'manage_users' = 'true')
    and access_status = 'active'
  );
$$ language sql security definer;

-- 6. Helper function: has specific permission?
create or replace function has_permission(perm_key text) returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and access_status = 'active'
    and (
      is_super_admin = true
      or role in ('super_admin', 'admin')
      or (permissions->>perm_key)::boolean = true
    )
  );
$$ language sql security definer;

-- 7. RLS: Profiles read & write
drop policy if exists "profiles_manage_users_write" on profiles;
create policy "profiles_manage_users_write" on profiles for all
  using (is_admin() or has_permission('manage_users'));
