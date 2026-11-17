-- Put the bill data into one spelling.
--
-- The Petpooja reports write the supplier as "Ambrosia - The Classic Bakehouse
-- [Supplier]" and the payment state as "Paid" or "Unpaid". The manual entry
-- form wrote the payment state as "due". Left alone, this causes two real
-- problems:
--
--   - the daily sync matches an existing bill by supplier + invoice number.
--     A bill stored as "X [Supplier]" and a new one stored as "X" are two
--     different bills as far as that match is concerned, so the same bill
--     would be written again every morning;
--   - "Paid", "Unpaid" and "due" are three spellings of two states, so a
--     filter on the payment state misses most of the bills.
--
-- The supplier tag is removed, the payment state is reduced to 'paid' and
-- 'unpaid', and the supplier list is built from the bills. Nothing else
-- changes, and no bill is added or removed.

-- 1. The supplier name: drop the "[Supplier]" tag, tidy the spaces.
update public.expenses
set vendor_name = btrim(
      regexp_replace(
        regexp_replace(vendor_name, '\s*\[Supplier\]\s*$', '', 'i'),
        '\s+', ' ', 'g'
      )
    )
where vendor_name is not null
  and vendor_name ~* '\[Supplier\]';

-- 2. The payment state: two spellings.
update public.expenses
set payment_status = 'paid'
where payment_status is not null
  and lower(btrim(payment_status)) in ('paid', 'settled', 'cleared');

update public.expenses
set payment_status = 'unpaid'
where payment_status is null
   or lower(btrim(payment_status)) not in ('paid', 'settled', 'cleared');

-- 3. The supplier list, built from the bills.
--
-- The bills name their supplier, and the manual entry screen offers the
-- supplier list — so every supplier on a bill must be on the list, or the
-- next bill typed by hand cannot pick it.
with wanting as (
  select distinct btrim(
           regexp_replace(
             regexp_replace(e.vendor_name, '\s*\[Supplier\]\s*$', '', 'i'),
             '\s+', ' ', 'g'
           )
         ) as name
  from public.expenses e
  where e.vendor_name is not null
)
insert into public.vendors (name)
select w.name
from wanting w
where w.name <> ''
  and not exists (
    select 1 from public.vendors v where lower(v.name) = lower(w.name)
  )
on conflict (name) do nothing;
