-- Migration: Create Company Documents, SOPs & Training Materials Portal
-- Created: 2026-09-26

-- 1. Create company_documents table
create table if not exists company_documents (
  id bigint generated always as identity primary key,
  title text not null,
  category text not null check (category in ('sop', 'policy', 'training', 'food_safety', 'targets', 'other')),
  department text references departments(name) on update cascade on delete set null,
  doc_type text not null default 'pdf' check (doc_type in ('pdf', 'article')),
  file_url text,
  file_name text,
  content_html text,
  description text,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Enable Row Level Security
alter table company_documents enable row level security;

-- 3. RLS Policies
-- All active employees can read documents for their department or company-wide (department is null)
create policy "company_documents_select" on company_documents for select
  using (
    auth.role() = 'authenticated'
  );

-- Admins, super admins, or managers with manage_documents can insert/update/delete
create policy "company_documents_write" on company_documents for all
  using (
    is_admin() or has_permission('manage_documents')
  );

-- 4. Insert standard initial policy placeholders if empty
insert into company_documents (title, category, department, doc_type, description, content_html)
select
  'Attendance, Punctuality & Weekly Off Policy',
  'policy',
  null,
  'article',
  'Official guidelines on Petpooja attendance punches, shift timings, 4 weekly offs allowance, and absence forfeiture rules.',
  '<h2>1. Shift Timings & Standard Hours</h2><p>All full-time employees are scheduled for 10 hours per day (exception: Employee Code 15 - 9 hours). All team members must punch in and out using the Petpooja POS terminal at the start and conclusion of each shift.</p><h2>2. Weekly Offs & Leave Allowance</h2><p>Each employee is entitled to 4 paid weekly offs per monthly pay period (20th to 19th). Unused weekly offs are forfeited and not encashed.</p><h2>3. Absence & Penalty Rules</h2><p>Weekly offs are lost in blocks of 7 absent days beyond the 4-day allowance (e.g., 5–11 extra absent days = -1 off, 12–18 = -2 offs). Unapproved absences directly affect monthly payroll calculations.</p>'
where not exists (select 1 from company_documents where title = 'Attendance, Punctuality & Weekly Off Policy');

insert into company_documents (title, category, department, doc_type, description, content_html)
select
  'Kitchen Station Hygiene & FIFO Food Safety SOP',
  'food_safety',
  'Kitchen',
  'article',
  'Standard Operating Procedure for food preparation hygiene, prep station setup, and FIFO stock rotation.',
  '<h2>1. Personal Hygiene & Grooming</h2><p>Clean chef coats, aprons, and hairnets must be worn at all times in food preparation areas. Hand washing is mandatory every 30 minutes, after breaks, and when switching between raw and cooked items.</p><h2>2. FIFO (First In, First Out) Storage</h2><p>All prepped items, marinades, sauces, and raw ingredients must be clearly labeled with Item Name, Prep Date, and Expiry Date. Older stock must always be placed forward and used first.</p><h2>3. Temperature Danger Zone</h2><p>Keep hot food hot (above 60°C) and cold food cold (below 5°C). Never leave perishable items at room temperature for longer than 20 minutes during prep.</p>'
where not exists (select 1 from company_documents where title = 'Kitchen Station Hygiene & FIFO Food Safety SOP');
