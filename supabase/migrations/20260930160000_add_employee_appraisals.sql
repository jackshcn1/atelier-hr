-- Migration: Employee performance appraisals
-- Created: 2026-09-30
--
-- Salary changes were recorded but nothing captured performance over time, so
-- there was no way to see how someone had grown beyond their pay. An appraisal
-- records a dated performance rating, optionally with a linked salary change,
-- giving a rating history across an employee's tenure.
--
-- salary_change_id links to the salary_history row the appraisal produced. It
-- is nullable because an appraisal may rate performance without changing pay.

create table if not exists public.employee_appraisals (
  id bigint generated always as identity primary key,
  employee_id text not null references public.employees(employee_id) on update cascade on delete cascade,
  appraisal_date date not null default current_date,
  period_covered text,
  rating numeric not null check (rating >= 1 and rating <= 5),
  rating_label text,
  previous_designation text,
  new_designation text,
  salary_change_id bigint references public.salary_history(id) on delete set null,
  salary_change_applied boolean not null default false,
  reviewer text not null,
  reviewer_employee_id text references public.employees(employee_id) on update cascade on delete set null,
  remarks text,
  next_review_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_appraisals_employee_idx
  on public.employee_appraisals (employee_id, appraisal_date desc);

-- One appraisal per employee per day keeps an accidental double-submit from
-- creating two reviews on the same date.
create unique index if not exists employee_appraisals_unique_per_day
  on public.employee_appraisals (employee_id, appraisal_date);

alter table public.employee_appraisals enable row level security;

-- Employees may read their own appraisals; HR and admins read all.
drop policy if exists "ea_select" on public.employee_appraisals;
create policy "ea_select" on public.employee_appraisals for select
  using (
    employee_id = my_employee_id()
    or is_admin()
    or has_permission('view_employees')
    or has_permission('view_payroll')
  );

-- Writing an appraisal is an HR action, never a self-service one.
drop policy if exists "ea_write" on public.employee_appraisals;
create policy "ea_write" on public.employee_appraisals for all
  using (is_admin() or has_permission('edit_employees') or has_permission('view_payroll'))
  with check (is_admin() or has_permission('edit_employees') or has_permission('view_payroll'));

notify pgrst, 'reload schema';