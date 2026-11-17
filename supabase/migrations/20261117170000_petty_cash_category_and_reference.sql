-- Two columns for the petty cash form.
--
-- The petty cash ledger could say how much was in and how much was out, and
-- who it was paid to, but not what it was for or which receipt it matched.
-- The cost breakdown grouped petty expenses by vendor, which made every
-- grocery run a separate line.
--
--   category   what the money was for — groceries, ice, cleaning, repairs
--   reference  the bill or receipt number, so the float can be reconciled
--
-- Both are optional: the rows already on record stay valid without them.

alter table public.petty_cash_ledger
  add column if not exists category text,
  add column if not exists reference text;

comment on column public.petty_cash_ledger.category is 'What the petty cash was spent on';
comment on column public.petty_cash_ledger.reference is 'Bill or receipt number';
