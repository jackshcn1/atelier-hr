-- Phase 3: Onboarding Documentation — clause templates + acknowledgment tracking
-- Non-destructive (new tables, new column on existing)

-- 1. Clause template table (admin-only, hidden from employee view)
create table if not exists public.onboarding_doc_templates (
  id bigint generated always as identity primary key,
  name text not null, -- e.g. 'Offer Letter Terms', 'POSH Policy'
  clause_text text not null,
  default_applicable text not null check (default_applicable in ('department','employment_type','assets_assigned','pf_esi_applicable')),
  default_condition text, -- e.g. 'full-time' or 'Kitchen' or 'uniform_provided'
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.onboarding_doc_templates enable row level security;
create policy "odt_read" on onboarding_doc_templates for select using (is_admin() or has_permission('manage_documents'));
create policy "odt_write" on onboarding_doc_templates for all using (is_admin() or has_permission('manage_documents'));

-- 2. Acknowledgment tracking: one combined signed document per employee
create table if not exists public.onboarding_acknowledgments (
  id bigint generated always as identity primary key,
  employee_id text references public.employees(employee_id) on update cascade on delete cascade,
  clauses_merged text[] default '{}', -- names of included clauses
  pdf_url text,
  signed_collected boolean default false,
  signed_collected_date date,
  signed_by_employee text,
  signed_by_hr text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.onboarding_acknowledgments enable row level security;
create policy "ack_read" on onboarding_acknowledgments for select using (is_admin() or has_permission('manage_documents') or has_permission('edit_employees'));
create policy "ack_write" on onboarding_acknowledgments for all using (is_admin() or has_permission('manage_documents') or has_permission('edit_employees'));

-- 3. Add acknowledgment reference to employees (for quick Active gate check)
alter table public.employees
  add column if not exists acknowledgment_id bigint references public.onboarding_acknowledgments(id) on delete set null;

notify pgrst, 'reload schema';
