-- =====================================================================
-- Migration: Expanded Onboarding Workflow Status & Asset Tracking
-- Created: 2026-10-05
-- =====================================================================

-- 1. Add Asset detail fields -------------------------------------------
alter table if exists public.employee_assets
  add column if not exists units int not null default 1,
  add column if not exists deposit_amount numeric not null default 0,
  add column if not exists date_issued date,
  add column if not exists status text not null default 'Issued'
    check (status in ('Issued', 'Returned', 'Lost', 'Damaged'));

-- 2. Add Onboarding Status Gating fields -------------------------------
alter table if exists public.employees
  add column if not exists onboarding_status text not null default 'Draft'
    check (onboarding_status in ('Draft', 'Documents Pending', 'Compensation Set', 'Assets Issued', 'Active')),
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;

-- 3. Training Checklists (for Manager Reporting) -----------------------
create table if not exists public.training_checklists (
  id bigint generated always as identity primary key,
  template_name text not null,
  department text references public.departments(name) on update cascade,
  is_active boolean default true
);

create table if not exists public.employee_training (
  id bigint generated always as identity primary key,
  employee_id text not null references public.employees(employee_id) on update cascade on delete cascade,
  checklist_id bigint not null references public.training_checklists(id) on delete cascade,
  status text not null default 'not-started' check (status in ('not-started', 'in-progress', 'completed')),
  deadline date,
  completed_at timestamptz
);

-- Update RLS for new tables
alter table public.training_checklists enable row level security;
alter table public.employee_training enable row level security;

create policy "training_checklists_read" on public.training_checklists for select to authenticated using (true);
create policy "employee_training_read" on public.employee_training for select to authenticated using (
  is_admin() or has_permission('manage_training')
);
create policy "employee_training_write" on public.employee_training for all to authenticated using (
  is_admin() or has_permission('manage_training')
);

notify pgrst, 'reload schema';
