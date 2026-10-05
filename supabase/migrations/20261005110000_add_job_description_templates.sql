-- =====================================================================
-- Migration: Job description templates per designation
-- Created: 2026-10-05
-- =====================================================================
--
-- Job descriptions used to be retyped on every Indeed posting. They are
-- role-level documents, not per-vacancy: the same "Waiter" JD is correct
-- whether we hire one waiter or three. Storing them once against the
-- designation means a new headcount listing pre-fills from the existing
-- text, and editing it there is optional.
--
-- One template per designation (enforced by the unique constraint) so the
-- "select a role, get its JD" lookup can never return two candidates for
-- the same role. A role with no row simply leaves the field blank.

create table if not exists public.job_description_templates (
  id bigint generated always as identity primary key,
  designation text not null unique
    references public.designations(name) on update cascade on delete cascade,
  job_description_title text,
  job_description_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_jd_templates_designation
  on public.job_description_templates (designation);

alter table public.job_description_templates enable row level security;

-- Anyone logged in may read a template — a department head creating a
-- headcount listing should not be blocked from seeing the role's JD.
drop policy if exists "jd_templates_read" on public.job_description_templates;
create policy "jd_templates_read" on public.job_description_templates for select
  to authenticated using (true);

-- Only admins maintain the library. Department heads may read it but not
-- silently rewrite the company-wide wording for a role.
drop policy if exists "jd_templates_write" on public.job_description_templates;
create policy "jd_templates_write" on public.job_description_templates for all
  to authenticated using (is_admin()) with check (is_admin());

-- Recording an edit here is worth an audit line: the JD text is what gets
-- pasted to Indeed, so a silent rewrite changes every future posting.
create or replace function public.touch_job_description_template()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists job_description_templates_touch on public.job_description_templates;
create trigger job_description_templates_touch
  before update on public.job_description_templates
  for each row execute function public.touch_job_description_template();

notify pgrst, 'reload schema';