-- Who wrote each cost row.
--
-- A bill reaches the books three ways: the Petpooja pull, the accountant's
-- Google Sheet, or a person typing it in on the site. The sheet is the record
-- for the bills Petpooja does not know about — electricity, gas, water, rent,
-- pest control, marketing — so the sheet has to be able to find its own rows
-- again. Otherwise ticking a bill "Paid" in the sheet would never reach the
-- books, and the sheet could only ever add, never correct.
--
-- `source` is that mark:
--
--   petpooja   written by the Petpooja pull
--   sheet      written by the accountant's sheet
--   manual     typed in by a person on the site
--   existing   written before this column existed
--
-- The rule that follows from it:
--
--   - a row the sheet wrote is updated when the sheet changes;
--   - a row anybody else wrote is left alone — so a Petpooja bill that was
--     also typed into the sheet is still counted once, and the Petpooja one
--     stays the record.
--
-- The rows that are already here came from the Petpooja pull and from the
-- site's own entry form, and nothing on a row says which was which. They are
-- marked `existing`, which the sheet reads as "not mine" — the safe answer,
-- because it means no bill already in the books is overwritten by a sheet
-- row. The Petpooja pull marks its own rows `petpooja` the next time it runs,
-- so the mark heals itself.
--
-- The petty cash ledger gets the same column for the same reason: a sheet
-- petty entry has to be found again to be corrected, and a petty entry typed
-- in by hand must not be.

alter table public.expenses
  add column if not exists source text not null default 'existing';

comment on column public.expenses.source is
  'Who wrote this row — petpooja, sheet, manual or existing';

alter table public.petty_cash_ledger
  add column if not exists source text not null default 'existing';

comment on column public.petty_cash_ledger.source is
  'Who wrote this row — sheet, manual or existing';
