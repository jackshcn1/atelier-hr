-- Migration: Enforce a single open variable pay cycle
-- Created: 2026-09-30
--
-- Two cycles could both sit at status 'open' (this happened: an ended cycle
-- was manually reopened during testing). The UI then offered two "live"
-- cycles, and neither dashboard could tell which figures were current.
--
-- A partial unique index makes that impossible going forward: at most one
-- cycle may be open, while any number of closed/paid cycles coexist. Reopening
-- a cycle now fails loudly instead of silently producing a duplicate.

create unique index if not exists variable_pay_periods_single_open_idx
  on public.variable_pay_periods ((status))
  where status = 'open';

notify pgrst, 'reload schema';