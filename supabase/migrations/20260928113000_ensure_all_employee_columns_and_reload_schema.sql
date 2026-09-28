-- Migration: Ensure all columns on employees exist and reload PostgREST schema cache
-- Created: 2026-09-28

-- 1. Ensure all columns exist on employees table
alter table public.employees
  add column if not exists standard_hours_per_day numeric not null default 10,
  add column if not exists deleted_at timestamptz,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists dob date,
  add column if not exists blood_group text,
  add column if not exists id_proof_type text,
  add column if not exists passport_photo_url text,
  add column if not exists gender text,
  add column if not exists address text,
  add column if not exists previous_work_history text,
  add column if not exists education_history text,
  add column if not exists designation text,
  add column if not exists department text references departments(name) on update cascade on delete set null,
  add column if not exists reporting_manager_id text references employees(employee_id) on update cascade,
  add column if not exists employment_type text check (employment_type in ('full-time','part-time','contract','probation')),
  add column if not exists date_of_joining date,
  add column if not exists probation_end_date date,
  add column if not exists date_of_leaving date,
  add column if not exists exit_reason text,
  add column if not exists status text default 'active' check (status in ('active','on-notice','exited')),
  add column if not exists pf_applicable boolean default false,
  add column if not exists esi_applicable boolean default false,
  add column if not exists accommodation_provided boolean default false,
  add column if not exists uniform_deposit_applicable text,
  add column if not exists current_fixed_salary numeric default 0,
  add column if not exists current_variable_salary numeric default 0,
  add column if not exists variable_pay_scheme text,
  add column if not exists leave_balance numeric,
  add column if not exists notes text;

-- Add check constraint to exit_reason if not already present
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'employees_exit_reason_check'
  ) then
    alter table public.employees
      add constraint employees_exit_reason_check
      check (exit_reason is null or exit_reason in ('resigned','absconding','terminated_disciplinary','terminated_admin'));
  end if;
end $$;

-- 2. Notify PostgREST to reload its schema cache immediately
notify pgrst, 'reload schema';
notify pgrst, 'reload config';
