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
  exit_reason text check (exit_reason in ('resigned','absconding','terminated_disciplinary','terminated_admin')),
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
  basic_da numeric,        -- snapshotted split, computed at time of entry
  hra numeric,             -- snapshotted split, computed at time of entry
  other_allowances numeric,-- snapshotted split, computed at time of entry
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

-- 11. Company policies — text shown on the onboarding acknowledgment doc ---
-- Single-row settings, admin-editable. Read-only for everyone logged in
-- so any department head reviewing an onboarding document sees current text.
create table company_policies (
  id int primary key default 1,
  guidelines_text text default 'Company guidelines go here — edit in Settings.',
  leave_policy_text text default 'Leave policy goes here — edit in Settings.',
  notice_period_text text default 'Notice period terms go here — edit in Settings.',
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
insert into company_policies (id) values (1);

-- 12. Deposit settings — current uniform/accommodation deposit amounts -----
-- Editing this only affects deposits recorded for employees added or
-- updated from now on; existing employees keep their snapshotted amount
-- in employee_deposits below.
create table deposit_settings (
  id int primary key default 1,
  uniform_deposit_amount numeric not null default 0,
  accommodation_deposit_amount numeric not null default 0,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
insert into deposit_settings (id) values (1);

-- 13. Employee deposits — actual amount snapshotted per employee ------------
create table employee_deposits (
  id bigint generated always as identity primary key,
  employee_id text references employees(employee_id) on delete cascade,
  deposit_type text check (deposit_type in ('uniform','accommodation')),
  amount numeric not null,
  date_recorded date default current_date
);

-- 14. Profiles — links a Supabase Auth login to a role + department -----
-- One row per person who can log in (you, department heads). Create their
-- login in Supabase Authentication tab first, then add a matching row here.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text check (role in ('admin','department_head')) not null default 'department_head',
  department text references departments(name),
  display_name text
);

-- 12. Payroll settings — the basic+DA/HRA/other split rule ------------------
-- Single-row settings table. basic_da_floor: fixed salary up to this amount
-- is entirely basic+DA (Kerala minimum wage floor). Anything above it is
-- split between HRA and other allowances using hra_split_percent.
-- Editing this only affects NEW salary entries going forward — past
-- salary_history rows keep their already-computed split, so history never
-- silently changes.
create table payroll_settings (
  id int primary key default 1,
  basic_da_floor numeric not null default 18000,
  hra_split_percent numeric not null default 50, -- % of the amount above the floor
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
insert into payroll_settings (id) values (1);

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
alter table payroll_settings enable row level security;
alter table company_policies enable row level security;
alter table deposit_settings enable row level security;
alter table employee_deposits enable row level security;

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

-- Payroll settings: admin only
create policy "payroll_settings_admin" on payroll_settings for all using (is_admin());

-- Company policies: everyone logged in can read (for onboarding docs), admin writes
create policy "company_policies_read" on company_policies for select using (true);
create policy "company_policies_write" on company_policies for all using (is_admin());

-- Deposit settings: admin only
create policy "deposit_settings_admin" on deposit_settings for all using (is_admin());

-- Employee deposits: scoped like other employee-linked tables
create policy "employee_deposits_all" on employee_deposits for all
  using (is_admin() or exists (
    select 1 from employees e where e.employee_id = employee_deposits.employee_id
    and e.department = my_department()
  ));
