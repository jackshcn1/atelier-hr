-- Migration: Variable Pay Period Tracking, Metric Inputs & Locking
-- Created: 2026-09-28

-- 1. Variable pay periods — one row per monthly pay cycle (20th to 19th)
create table if not exists public.variable_pay_periods (
  id bigint generated always as identity primary key,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open', 'locked', 'paid')),
  locked_at timestamptz,
  locked_by text,
  payroll_run_id bigint references public.payroll_runs(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint unique_period check (period_start <> period_end)
);

create unique index if not exists variable_pay_periods_range_idx
  on public.variable_pay_periods (period_start, period_end);

-- 2. Metric inputs — the collected actual value for one metric, for one period
-- employee_id is NULL for team-scoped metrics (one value serves every team member)
create table if not exists public.variable_metric_inputs (
  id bigint generated always as identity primary key,
  period_id bigint not null references public.variable_pay_periods(id) on delete cascade,
  scheme_name text not null,
  metric_id text not null,
  employee_id text references public.employees(employee_id) on update cascade on delete cascade,
  actual_value numeric,
  source_type text check (source_type in (
    'checklist', 'feedback_form', 'petpooja', 'google_sheet', 'manual_entry', 'not_provided'
  )),
  source_filename text,
  source_detail jsonb default '{}'::jsonb,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create unique index if not exists variable_metric_inputs_unique
  on public.variable_metric_inputs (period_id, metric_id, coalesce(employee_id, 'TEAM'));

-- 3. Post-payroll edit audit trail
create table if not exists variable_pay_edit_log (
  id bigint generated always as identity primary key,
  period_id bigint not null references public.variable_pay_periods(id) on delete cascade,
  metric_id text not null,
  employee_id text,
  old_value numeric,
  new_value numeric,
  reason text,
  actor text,
  created_at timestamptz default now()
);

-- 4. Row Level Security
alter table public.variable_pay_periods enable row level security;
alter table public.variable_metric_inputs enable row level security;
alter table public.variable_pay_edit_log enable row level security;

drop policy if exists "vpp_select" on public.variable_pay_periods;
drop policy if exists "vpp_write" on public.variable_pay_periods;
create policy "vpp_select" on public.variable_pay_periods for select
  using (auth.role() = 'authenticated');
create policy "vpp_write" on public.variable_pay_periods for all
  using (is_admin() or has_permission('view_payroll') or has_permission('finalize_payroll'));

drop policy if exists "vmi_select" on public.variable_metric_inputs;
drop policy if exists "vmi_write" on public.variable_metric_inputs;
create policy "vmi_select" on public.variable_metric_inputs for select
  using (auth.role() = 'authenticated');
create policy "vmi_write" on public.variable_metric_inputs for all
  using (is_admin() or has_permission('view_payroll') or has_permission('finalize_payroll'));

drop policy if exists "vpel_select" on public.variable_pay_edit_log;
drop policy if exists "vpel_write" on public.variable_pay_edit_log;
create policy "vpel_select" on public.variable_pay_edit_log for select
  using (is_admin() or has_permission('view_payroll'));
create policy "vpel_write" on public.variable_pay_edit_log for insert
  with check (is_admin() or has_permission('view_payroll'));

-- 5. Menu category mapping — the 14 kitchen categories that count toward prep time
create table if not exists public.kitchen_menu_categories (
  category text primary key,
  counts_toward_prep_time boolean not null default true,
  created_at timestamptz default now()
);

insert into public.kitchen_menu_categories (category, counts_toward_prep_time) values
  ('Appetizer', true), ('Arabic', true), ('Burgers', true), ('Chinese', true),
  ('Combos', true), ('Grills', true), ('Indian', true), ('Indian Breads', true),
  ('Kothu Parotta', true), ('Pastas', true), ('Pizza', true), ('Salads', true),
  ('Sandwiches', true), ('Soups', true)
on conflict (category) do nothing;

alter table public.kitchen_menu_categories enable row level security;
drop policy if exists "kmc_select" on public.kitchen_menu_categories;
drop policy if exists "kmc_write" on public.kitchen_menu_categories;
create policy "kmc_select" on public.kitchen_menu_categories for select
  using (auth.role() = 'authenticated');
create policy "kmc_write" on public.kitchen_menu_categories for all
  using (is_admin() or has_permission('manage_settings'));

notify pgrst, 'reload schema';
