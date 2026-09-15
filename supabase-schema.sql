-- Atelier HR Tool — Database Schema
-- Paste this whole file into Supabase → SQL Editor → New Query → Run.
-- Safe to run once on a fresh project.

-- 1. Departments -------------------------------------------------
create table departments (
  name text primary key,
  head_employee_id text
);

-- 2. Employees -----------------------------------------------------
create table employees (
  employee_id text primary key,
  name text not null,
  phone text,
  email text,
  emergency_contact_name text,
  emergency_contact_phone text,
  dob date,
  blood_group text,
  id_proof_type text,
  id_proof_number text,
  designation text,
  department text references departments(name),
  reporting_manager_id text references employees(employee_id),
  employment_type text check (employment_type in ('full-time','part-time','contract','probation')),
  date_of_joining date,
  probation_end_date date,
  date_of_leaving date,
  status text default 'active' check (status in ('active','on-notice','exited')),
  pf_applicable boolean default false,
  esi_applicable boolean default false,
  accommodation_provided boolean default false,
  uniform_issued text,
  current_fixed_salary numeric default 0,
  current_variable_salary numeric default 0,
  leave_balance numeric,
  notes text,
  created_at timestamptz default now()
);

-- 3. Salary history -------------------------------------------------
create table salary_history (
  id bigint generated always as identity primary key,
  employee_id text references employees(employee_id) on delete cascade,
  fixed numeric not null,
  variable numeric not null,
  effective_from date not null,
  changed_by text,
  reason text,
  created_at timestamptz default now()
);

-- 4. Track record (notes / warnings / merits) ------------------------
create table track_record (
  id bigint generated always as identity primary key,
  employee_id text references employees(employee_id) on delete cascade,
  date date not null default current_date,
  type text check (type in ('note','warning','merit')),
  author text,
  text text,
  created_at timestamptz default now()
);

-- 5. Documents (metadata only — files live in Supabase Storage) -----
create table documents (
  id bigint generated always as identity primary key,
  employee_id text references employees(employee_id) on delete cascade,
  doc_type text,
  status text check (status in ('pending','signed','on-file')) default 'pending',
  file_url text,
  date_added date default current_date
);

-- 6. Document templates (onboarding packets per department) ---------
create table doc_templates (
  id bigint generated always as identity primary key,
  department text references departments(name),
  doc_name text,
  description text,
  required boolean default true
);

-- 7. Training records -------------------------------------------------
create table training_records (
  id bigint generated always as identity primary key,
  employee_id text references employees(employee_id) on delete cascade,
  training_name text,
  status text check (status in ('not-started','in-progress','completed')) default 'not-started',
  completed_date date
);

-- 8. Payroll ------------------------------------------------------------
create table payroll_runs (
  id bigint generated always as identity primary key,
  period text not null, -- e.g. '2026-09'
  imported_attendance jsonb,
  calculation_logic_version text,
  generated_on timestamptz default now()
);

create table payroll_line_items (
  id bigint generated always as identity primary key,
  payroll_run_id bigint references payroll_runs(id) on delete cascade,
  employee_id text references employees(employee_id),
  days_present numeric,
  gross_pay numeric,
  deductions numeric,
  net_pay numeric
);

-- 9. Exit records ---------------------------------------------------------
create table exit_records (
  employee_id text primary key references employees(employee_id) on delete cascade,
  assets_issued jsonb,
  assets_returned jsonb,
  uniform_returned boolean default false,
  clearance_status text default 'pending',
  exit_date date
);

-- 10. Audit log -------------------------------------------------------------
create table audit_log (
  id bigint generated always as identity primary key,
  date timestamptz default now(),
  actor text,
  action text,
  record_affected text
);

-- 11. Profiles — links a Supabase Auth login to a role + department -----
-- One row per person who can log in (you, department heads). Create their
-- login in Supabase Authentication tab first, then add a matching row here.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text check (role in ('admin','department_head')) not null default 'department_head',
  department text references departments(name),
  display_name text
);

-- =====================================================================
-- Row Level Security — admins see everything, department heads see only
-- their own department's employees.
-- =====================================================================

alter table employees enable row level security;
alter table salary_history enable row level security;
alter table track_record enable row level security;
alter table documents enable row level security;
alter table training_records enable row level security;
alter table departments enable row level security;
alter table doc_templates enable row level security;
alter table payroll_runs enable row level security;
alter table payroll_line_items enable row level security;
alter table exit_records enable row level security;
alter table profiles enable row level security;
alter table audit_log enable row level security;

-- helper: is the logged-in user an admin?
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer;

-- helper: logged-in user's own department
create or replace function my_department() returns text as $$
  select department from profiles where id = auth.uid();
$$ language sql security definer;

-- Employees: admins see all, department heads see their department
create policy "employees_select" on employees for select
  using (is_admin() or department = my_department());
create policy "employees_write" on employees for insert with check (is_admin() or department = my_department());
create policy "employees_update" on employees for update
  using (is_admin() or department = my_department());
create policy "employees_delete" on employees for delete using (is_admin());

-- Salary history / track record / documents / training: scoped by the
-- employee's department, admins see all
create policy "salary_history_all" on salary_history for all
  using (is_admin() or exists (
    select 1 from employees e where e.employee_id = salary_history.employee_id
    and e.department = my_department()
  ));

create policy "track_record_all" on track_record for all
  using (is_admin() or exists (
    select 1 from employees e where e.employee_id = track_record.employee_id
    and e.department = my_department()
  ));

create policy "documents_all" on documents for all
  using (is_admin() or exists (
    select 1 from employees e where e.employee_id = documents.employee_id
    and e.department = my_department()
  ));

create policy "training_all" on training_records for all
  using (is_admin() or exists (
    select 1 from employees e where e.employee_id = training_records.employee_id
    and e.department = my_department()
  ));

-- Departments and templates: everyone logged in can read, only admin edits
create policy "departments_read" on departments for select using (true);
create policy "departments_write" on departments for all using (is_admin());
create policy "doc_templates_read" on doc_templates for select using (true);
create policy "doc_templates_write" on doc_templates for all using (is_admin());

-- Payroll and exit records: admin only (sensitive company-wide data)
create policy "payroll_runs_admin" on payroll_runs for all using (is_admin());
create policy "payroll_line_items_admin" on payroll_line_items for all using (is_admin());
create policy "exit_records_admin" on exit_records for all using (is_admin());

-- Profiles: you can read your own profile; admins can read/manage all
create policy "profiles_self" on profiles for select using (id = auth.uid() or is_admin());
create policy "profiles_admin_write" on profiles for all using (is_admin());

-- Audit log: admin only
create policy "audit_log_admin" on audit_log for all using (is_admin());
