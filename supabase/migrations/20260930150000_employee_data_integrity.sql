-- Migration: Employee record integrity
-- Created: 2026-09-30
--
-- The employee record had two independent soft-delete mechanisms that could
-- disagree: `deleted_at` and `status`. Two records were deleted one way but
-- still flagged 'active' the other, so they showed up in some queries and not
-- others depending on which column the query filtered on.
--
-- The check constraints below make the two impossible to drift apart again.

-- 1. Backfill existing inconsistencies before adding the constraints.
--    A soft-deleted employee is no longer active; record them as exited so the
--    historical record is preserved rather than lost. The leaving date is
--    derived from when they were deleted, since the other constraints require
--    an exited employee to have one.
update public.employees
   set status = 'exited',
       date_of_leaving = coalesce(date_of_leaving, deleted_at::date)
 where deleted_at is not null
   and status = 'active';

-- A leaving date always implies the person has left.
update public.employees
   set status = 'exited'
 where date_of_leaving is not null
   and status = 'active';

-- 2. Keep `status` and `deleted_at` in step automatically.
--
--    Three separate screens write `deleted_at` (delete, restore, bulk import)
--    and none of them touched `status`. Rather than patch each caller and risk
--    them drifting apart again, a trigger derives the status change from the
--    soft-delete flag. Any code path that soft-deletes an employee gets a
--    consistent record for free.
--
--    NOTE: employees_delete_guard (see the earlier migration) restricts
--    deleted_at changes to admins. Trigger firing order is alphabetical by
--    name for equally-timed triggers, so this one is named to run first and
--    settle the status before that guard evaluates the row.
create or replace function public.sync_employee_status_with_delete() returns trigger as $$
begin
  -- Soft-deleted: the person is no longer active. Preserve an existing leaving
  -- date; otherwise derive it from when the record was removed.
  if new.deleted_at is not null and old.deleted_at is null then
    if new.status = 'active' then
      new.status := 'exited';
    end if;
    new.date_of_leaving := coalesce(new.date_of_leaving, new.deleted_at::date);
  end if;

  -- Restored: bring them back as active unless someone deliberately marked
  -- them on-notice, and drop the leaving date that the removal set.
  if new.deleted_at is null and old.deleted_at is not null then
    if new.status = 'exited' then
      new.status := 'active';
    end if;
    new.date_of_leaving := null;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists employees_status_sync on public.employees;
create trigger employees_status_sync
  before update on public.employees
  for each row
  execute function public.sync_employee_status_with_delete();

-- 3. Constraints that stop the two fields drifting apart by any other route
--    (a direct status edit, a bulk import, a script).
alter table public.employees
  drop constraint if exists employees_deleted_implies_not_active;
alter table public.employees
  add constraint employees_deleted_implies_not_active
  check (deleted_at is null or status <> 'active') not valid;

alter table public.employees
  drop constraint if exists employees_leaving_implies_exited;
alter table public.employees
  add constraint employees_leaving_implies_exited
  check (date_of_leaving is null or status = 'exited') not valid;

alter table public.employees
  drop constraint if exists employees_exited_has_leaving_date;
alter table public.employees
  add constraint employees_exited_has_leaving_date
  check (status <> 'exited' or date_of_leaving is not null) not valid;

alter table public.employees validate constraint employees_deleted_implies_not_active;
alter table public.employees validate constraint employees_leaving_implies_exited;
alter table public.employees validate constraint employees_exited_has_leaving_date;

notify pgrst, 'reload schema';