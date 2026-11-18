-- The sheet row a cost came from.
--
-- A bill in the books has to be findable again, so that a change in the sheet
-- can be carried into the books. Until now the only way to find a row was its
-- invoice number — and the accountant's sheet has no invoice-number column
-- for most of its entries, and the invoice number is not always written down
-- in any case.
--
-- So each row carries the identity of the sheet row it came from:
--
--   id:<entry id>   a row this system wrote — the site's entry form
--   ts:<timestamp>   a row typed in the Google Form — the moment it was made
--
-- It is deliberately **not** the amount or the date. The accountant is allowed
-- to correct those, and a bill must still be found after it has been
-- corrected — otherwise a correction would leave the old bill in the books
-- and add the corrected one next to it.
--
-- The unique index is the promise that a sheet row is counted once. Two
-- entries with the same key can only be the same bill, and the importer
-- skips the second of them rather than counting it twice.

alter table public.expenses
  add column if not exists source_key text;

comment on column public.expenses.source_key is
  'The sheet row this cost came from — its own identity';

create unique index if not exists expenses_source_key_key
  on public.expenses (source_key)
  where source_key is not null;

alter table public.petty_cash_ledger
  add column if not exists source_key text;

comment on column public.petty_cash_ledger.source_key is
  'The sheet row this entry came from — its own identity';

create unique index if not exists petty_cash_source_key_key
  on public.petty_cash_ledger (source_key)
  where source_key is not null;
