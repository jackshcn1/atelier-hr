-- Migration: Employee assets as a first-class record
-- Created: 2026-09-30
--
-- Assets were stored inside exit_records.assets_issued, which meant they only
-- appeared on the employee page as part of the exit section, so an asset
-- handed over mid-employment had nowhere to be recorded until the person left.
--
-- Assets are now their own table, trackable for the whole employment. The exit
-- clearance workspace reads from here rather than keeping its own copy.
--
-- asset_number is nullable because the numbering scheme is part of another
-- project and does not exist yet.

create table if not exists public.employee_assets (
  id bigint generated always as identity primary key,
  employee_id text not null references public.employees(employee_id) on update cascade on delete cascade,
  name text not null,
  asset_number text,
  date_handed_over date,
  returned boolean not null default false,
  date_returned date,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_assets_employee_idx
  on public.employee_assets (employee_id, returned);

alter table public.employee_assets enable row level security;

-- Employees can see what is tagged to their own name; HR sees all.
drop policy if exists "ea_select" on public.employee_assets;
create policy "ea_select" on public.employee_assets for select
  using (
    employee_id = my_employee_id()
    or is_admin()
    or has_permission('view_employees')
    or has_permission('view_payroll')
  );

-- Issuing and receiving an asset is an HR action.
drop policy if exists "ea_write" on public.employee_assets;
create policy "ea_write" on public.employee_assets for all
  using (is_admin() or has_permission('edit_employees') or has_permission('view_payroll'))
  with check (is_admin() or has_permission('edit_employees') or has_permission('view_payroll'));

-- Move any assets already recorded inside exit_records into the new table, so
-- nothing is lost in the transition. The old column stays in place but is no
-- longer written to.
insert into public.employee_assets (employee_id, name, returned)
select
  er.employee_id,
  a->>'name',
  coalesce((a->>'returned')::boolean, false)
from public.exit_records er,
     lateral jsonb_array_elements(coalesce(er.assets_issued, '[]'::jsonb)) as a
where a->>'name' is not null
on conflict do nothing;

notify pgrst, 'reload schema';