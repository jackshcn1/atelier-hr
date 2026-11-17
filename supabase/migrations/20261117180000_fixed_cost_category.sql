-- A category for each standing cost.
--
-- The standing-cost list is the checklist of what to expect every month —
-- rent, pest control, the equipment lease. The amount that actually lands
-- in a month comes from the invoice for it, which is a cost row like any
-- other. The two are matched by category, so the page can say "Rent — not
-- received yet" rather than showing a stale number from March.
--
-- `category` is what the match is made on. The existing rows have no
-- category, so they keep their name as the match key.

alter table public.fixed_costs
  add column if not exists category text;

update public.fixed_costs
set category = name
where category is null or category = '';

comment on column public.fixed_costs.category is 'What this standing cost is — used to match the month''s invoice to it';
