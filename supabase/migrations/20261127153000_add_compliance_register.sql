-- The compliance register.
--
-- What a restaurant must legally hold, what its suppliers must hold for it,
-- and what has to be done again and again. One table, because all three are
-- the same shape: something that is held, something that expires, and
-- somebody who is answerable for it.
--
--   kind = 'licence'      ours — FSSAI, Fire NOC, trade licence, insurance
--   kind = 'vendor_cert'  a supplier's own certificate, filed against them
--   kind = 'recurring'    a duty that repeats — pest control, calibration
--
-- A licence and a certificate are valid UNTIL a date. A recurring duty was
-- LAST DONE on a date and is NEXT DUE on another. Both are kept here, and
-- `lib/compliance.js` works out which is which.

create table if not exists compliance_items (
  id bigint generated always as identity primary key,

  -- What this is.
  kind text not null default 'licence'
    check (kind in ('licence', 'vendor_cert', 'recurring')),
  name text not null,
  category text,                    -- 'Regulatory', 'Fire safety', 'Insurance', 'Food safety', ...
  authority text,                   -- who issued it
  reference_no text,                -- the number on the certificate

  -- A licence or a certificate: valid until this day.
  issued_on date,
  expires_on date,

  -- A recurring duty: done on this day, due again on this day.
  cadence text check (cadence in ('weekly', 'fortnightly', 'monthly', 'quarterly', 'half_yearly', 'annual')),
  last_done_on date,
  next_due_on date,

  -- Whose it is. A vendor certificate belongs to a supplier; the owner is the
  -- member of staff answerable for it.
  vendor_id bigint references vendors(id) on delete set null,
  owner_employee_id text references employees(employee_id) on delete set null,

  -- What the renewal costs, and whether it has been paid.
  cost numeric(12, 2),
  payment_status text check (payment_status in ('paid', 'pending')),

  -- The proof: a file in the documents bucket, and/or a link to it.
  document_path text,
  document_url text,
  notes text,

  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists compliance_items_kind_idx on compliance_items (kind);
create index if not exists compliance_items_expires_on_idx on compliance_items (expires_on);
create index if not exists compliance_items_next_due_on_idx on compliance_items (next_due_on);
create index if not exists compliance_items_vendor_idx on compliance_items (vendor_id);

alter table compliance_items enable row level security;

-- Everyone signed in may read the register — it is the state of the
-- restaurant's paperwork, and the whole point is that it is not a secret.
drop policy if exists "compliance_items_select" on compliance_items;
create policy "compliance_items_select" on compliance_items
  for select using (auth.role() = 'authenticated');

-- Writing to it is for the people who run the place: an administrator, or
-- anyone holding the settings permission. A chef filling in a kitchen
-- checklist does not get to rewrite the licence register.
drop policy if exists "compliance_items_write" on compliance_items;
create policy "compliance_items_write" on compliance_items
  for all
  using (is_admin() or has_permission('manage_settings'))
  with check (is_admin() or has_permission('manage_settings'));
