-- The twice-weekly refresh of the last 90 days of purchases.
--
-- A bill that Petpooja has deleted outright leaves no trace in any report —
-- there is nothing to read. The only sign that it is gone is that the bill is
-- in the books and not in the report, which is a weaker signal than a
-- cancellation. So a bill is flagged here the first time it is missing, and
-- removed only if it is still missing at the next refresh. A single odd
-- export can never remove a good bill.
--
-- The key is the bill itself: its supplier, its invoice number and its date.
-- The case is not part of it, because the same bill is written "AMBROSIA" on
-- one day and "Ambrosia" the next.

create table if not exists public.finance_purchase_refresh_misses (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'bill',
  bill_key text not null,
  vendor_name text not null,
  invoice_number text not null,
  invoice_date date not null,
  amount numeric not null default 0,
  seen_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (kind, bill_key)
);

comment on table public.finance_purchase_refresh_misses is
  'Bills in the books that Petpooja''s report no longer has — flagged once, removed if they are still missing at the next refresh';

alter table public.finance_purchase_refresh_misses enable row level security;
