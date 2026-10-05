-- =====================================================================
-- Migration: Recruitment source channels + referrer attribution
-- Created: 2026-10-05
-- =====================================================================
--
-- Source list revised: plain "Referral" was ambiguous (referral by whom?) and
-- the actual channels we post on were missing. "Internal referral" is kept
-- separate precisely so it can carry the name of the employee who referred —
-- that is the whole point of tracking it as its own channel rather than
-- folding it into a generic "Referral".
--
-- "Other" needs free text, which `source_details` already holds. It is
-- required for the two channels where the detail is the useful part:
-- an internal referral's employee name, and naming the "Other" channel.

alter table public.candidates drop constraint if exists candidates_source_check;
alter table public.candidates add constraint candidates_source_check
  check (source in ('Indeed', 'OLX', 'LinkedIn', 'Instagram', 'Newspaper',
                    'Walk-in', 'Internal referral', 'Other'));

-- The referring employee's ID. Nullable: most candidates have no referrer,
-- and an external referral has nobody to point at. ON UPDATE CASCADE so
-- renaming an employee ID (which the app supports) keeps the referral link
-- intact rather than orphaning the attribution.
alter table public.candidates add column if not exists referred_by_employee_id text
  references public.employees(employee_id) on update cascade on delete set null;

create index if not exists idx_candidates_referred_by
  on public.candidates (referred_by_employee_id)
  where referred_by_employee_id is not null;

-- Referrals and "Other" are only meaningful with the detail attached, so
-- require it for exactly those two. Everything else may leave it blank.
alter table public.candidates drop constraint if exists candidates_source_detail_required;
alter table public.candidates add constraint candidates_source_detail_required
  check (
    source not in ('Internal referral', 'Other')
    or (coalesce(btrim(referred_by_employee_id), '') <> '' or coalesce(btrim(source_details), '') <> '')
  );

notify pgrst, 'reload schema';