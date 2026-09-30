-- Migration: Strengthen exit clearance
-- Created: 2026-09-30
--
-- Exit records were almost entirely unused. Both employees who had actually
-- left had completely blank records: no exit date, no clearance status, no
-- asset return state. That means there was no answer to "did this person hand
-- back their uniform and kit", which is the question the Kerala Shops and
-- Establishments Act record-keeping obligations exist to answer.
--
-- This adds the fields needed to run a real clearance, and backfills the two
-- known exits so the history is not blank.

alter table public.exit_records
  add column if not exists last_working_day date,
  add column if not exists notice_period_days integer,
  add column if not exists notice_served boolean,
  add column if not exists exit_type text,
  add column if not exists last_salary_paid_date date,
  add column if not exists gratuity_payable numeric,
  add column if not exists gratuity_paid boolean not null default false,
  add column if not exists pending_dues jsonb default '[]'::jsonb,
  add column if not exists deposit_settled boolean not null default false,
  add column if not exists settled_on date,
  add column if not exists settled_by text,
  add column if not exists open_remarks text;

-- Exit type is a small controlled vocabulary. 'other' is kept as an escape
-- hatch rather than forcing a misleading value, since the employee record
-- already carries the finer-grained exit_reason (resigned / absconding /
-- terminated_disciplinary / terminated_admin).
alter table public.exit_records
  drop constraint if exists exit_records_exit_type_check;
alter table public.exit_records
  add constraint exit_records_exit_type_check
  check (exit_type is null or exit_type in ('voluntary', 'notional', 'disciplinary', 'absconding', 'retirement', 'other'));

-- An exit is only 'cleared' once someone has recorded that they settled it.
-- This is the guard against a clearance being marked complete with nothing
-- behind it.
alter table public.exit_records
  drop constraint if exists exit_records_cleared_needs_settlement;
alter table public.exit_records
  add constraint exit_records_cleared_needs_settlement
  check (clearance_status is distinct from 'cleared' or (settled_on is not null and settled_by is not null)) not valid;

alter table public.exit_records
  drop constraint if exists exit_records_settled_needs_cleared;
alter table public.exit_records
  add constraint exit_records_settled_needs_cleared
  check (settled_on is null or clearance_status = 'cleared') not valid;

-- Backfill the exits that already happened. last_working_day mirrors the
-- employee's recorded leaving date; everything requiring human knowledge
-- (notice served, gratuity, deposit settlement) stays null until confirmed.
insert into public.exit_records (
  employee_id, exit_date, last_working_day, exit_type, clearance_status
)
select
  e.employee_id,
  e.date_of_leaving,
  e.date_of_leaving,
  case
    when e.exit_reason = 'absconding' then 'absconding'
    when e.exit_reason = 'terminated_disciplinary' then 'disciplinary'
    when e.exit_reason = 'terminated_admin' then 'notional'
    else 'voluntary'
  end,
  'pending'
from public.employees e
where e.status = 'exited'
  and e.date_of_leaving is not null
  and not exists (
    select 1 from public.exit_records er where er.employee_id = e.employee_id
  )
on conflict (employee_id) do nothing;

notify pgrst, 'reload schema';