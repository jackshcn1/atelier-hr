-- Migration: Add Designations Table, Enhance Departments, and Configure Permissions
-- Created: 2026-09-28

-- 1. Enhance departments table with description and timestamps
alter table public.departments
  add column if not exists description text,
  add column if not exists created_at timestamptz default now();

-- 2. Create designations table
create table if not exists public.designations (
  id bigint generated always as identity primary key,
  name text not null unique,
  department text references public.departments(name) on update cascade on delete set null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Enable RLS
alter table public.departments enable row level security;
alter table public.designations enable row level security;

-- 4. Policies for departments
drop policy if exists "departments_read" on public.departments;
drop policy if exists "departments_write" on public.departments;
drop policy if exists "departments_select" on public.departments;
drop policy if exists "departments_all" on public.departments;

create policy "departments_select" on public.departments for select
  using (auth.role() = 'authenticated');

create policy "departments_write" on public.departments for all
  using (is_admin() or has_permission('manage_settings') or has_permission('edit_employees'));

-- 5. Policies for designations
drop policy if exists "designations_select" on public.designations;
drop policy if exists "designations_write" on public.designations;

create policy "designations_select" on public.designations for select
  using (auth.role() = 'authenticated');

create policy "designations_write" on public.designations for all
  using (is_admin() or has_permission('manage_settings') or has_permission('edit_employees'));

-- 6. Seed standard initial departments
insert into public.departments (name, description)
values
  ('Service', 'Front-of-house dining, guest hosting, captains, and table service.'),
  ('Kitchen', 'Food preparation, cooking lines, station sanitation, and recipe consistency.'),
  ('Housekeeping', 'Dining area cleanliness, restroom maintenance, and crockery handling.'),
  ('Cash/ Counter/ Customer Care', 'Takeaway orders, POS billing, customer support, and B2B corporate sales.'),
  ('Admin', 'Operations management, accounting, payroll, and statutory filings.'),
  ('Security', 'Premises security, access control, and staff safety.')
on conflict (name) do nothing;

-- 7. Seed standard initial designations
insert into public.designations (name, department, description)
values
  ('Captain', 'Service', 'Dining floor leadership, guest interaction, and upsell management.'),
  ('Waiter', 'Service', 'Table service, food runner, and dining floor assistance.'),
  ('Service Helper', 'Service', 'Dining room busser, table clearing, and water/cutlery replenishment.'),
  ('Head Chef', 'Kitchen', 'Kitchen operations head, menu execution, and quality control.'),
  ('Kitchen Lead', 'Kitchen', 'Shift preparation lead and station supervisor.'),
  ('Line Cook', 'Kitchen', 'Station cooking, order execution, and recipe preparation.'),
  ('Commi Chef', 'Kitchen', 'Junior culinary prep and ingredient staging.'),
  ('Kitchen Helper', 'Kitchen', 'Dishwashing, vegetable chopping, and raw prep assistance.'),
  ('Cashier', 'Cash/ Counter/ Customer Care', 'POS register billing, cash/card reconciliation, and receipt handover.'),
  ('Customer Care Lead', 'Cash/ Counter/ Customer Care', 'Guest inquiries, feedback resolution, and delivery coordination.'),
  ('B2B Sales Executive', 'Cash/ Counter/ Customer Care', 'Corporate catering orders, GST client acquisition, and collections.'),
  ('Housekeeping Staff', 'Housekeeping', 'Restroom cleaning, floor sweeping/mopping, and dining sanitation.'),
  ('Housekeeping Supervisor', 'Housekeeping', 'Cleaning inspection checklists and supplies management.'),
  ('Accountant', 'Admin', 'Day-end reconciliations, delivery portal payouts, and GST compliance.'),
  ('Operations Manager', 'Admin', 'Overall restaurant operations and shift administration.'),
  ('Store Manager', 'Admin', 'Inventory management, Petpooja stock receipts, and vendor deliveries.'),
  ('Security Guard', 'Security', 'Premises entrance monitoring and property security.')
on conflict (name) do nothing;

-- 8. Reload PostgREST schema cache
notify pgrst, 'reload schema';
notify pgrst, 'reload config';
