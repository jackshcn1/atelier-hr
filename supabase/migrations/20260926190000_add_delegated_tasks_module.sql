-- Migration: Delegated Tasks, Subtasks, Comments & Audit Trail Module
-- Created: 2026-09-26

-- 1. Tasks Table
create table if not exists tasks (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  priority text default 'normal' check (priority in ('urgent', 'high', 'normal', 'low')),
  cadence text default 'adhoc' check (cadence in ('adhoc', 'daily', 'weekly', 'monthly')),
  cadence_details jsonb default '{}'::jsonb,
  due_date date not null,
  due_time time default '23:59:00',
  status text default 'assigned' check (status in ('assigned', 'in_progress', 'completed', 'overdue', 'reopened')),
  assigned_type text default 'individual' check (assigned_type in ('individual', 'group', 'department', 'all_staff')),
  assigned_employee_id text references employees(employee_id) on update cascade on delete set null,
  assigned_employee_ids jsonb default '[]'::jsonb,
  assigned_department text references departments(name) on update cascade on delete set null,
  subtasks jsonb default '[]'::jsonb,
  mandatory_proofs jsonb default '[]'::jsonb,
  completed_at timestamptz,
  completed_by text,
  completed_by_name text,
  delay_seconds numeric default 0,
  is_overdue boolean default false,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Task Comments Thread
create table if not exists task_comments (
  id bigint generated always as identity primary key,
  task_id bigint references tasks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  author_role text,
  message text not null,
  attachment_url text,
  created_at timestamptz default now()
);

-- 3. Task Audit Logs
create table if not exists task_audit_logs (
  id bigint generated always as identity primary key,
  task_id bigint references tasks(id) on delete cascade,
  actor_name text not null,
  action text not null,
  details text,
  created_at timestamptz default now()
);

-- 4. Enable Row Level Security
alter table tasks enable row level security;
alter table task_comments enable row level security;
alter table task_audit_logs enable row level security;

-- 5. RLS Policies
create policy "tasks_select_all" on tasks for select using (auth.role() = 'authenticated');
create policy "tasks_all_authenticated" on tasks for all using (auth.role() = 'authenticated');

create policy "task_comments_select_all" on task_comments for select using (auth.role() = 'authenticated');
create policy "task_comments_insert_all" on task_comments for insert with check (auth.role() = 'authenticated');

create policy "task_audit_logs_select_all" on task_audit_logs for select using (auth.role() = 'authenticated');
create policy "task_audit_logs_insert_all" on task_audit_logs for insert with check (auth.role() = 'authenticated');

-- 6. Insert Starter Tasks for Compliance & Restaurant Setup
insert into tasks (title, description, priority, cadence, due_date, due_time, status, assigned_type, assigned_department, subtasks, mandatory_proofs)
values
(
  'Acquire & Renew Mandatory Restaurant Statutory Licenses',
  'Ensure all official regulatory licenses and food safety clearances are renewed and uploaded to the compliance portal.',
  'urgent',
  'adhoc',
  current_date + interval '14 days',
  '18:00:00',
  'assigned',
  'department',
  'Admin',
  '[
    { "id": "sub_1", "title": "FSSAI State License Renewal & Food Safety Display Board", "completed": false },
    { "id": "sub_2", "title": "Trivandrum Municipal Corporation Trade License", "completed": false },
    { "id": "sub_3", "title": "Legal Metrology Verification Certificate for Kitchen & Bar Scales", "completed": false },
    { "id": "sub_4", "title": "Fire & Rescue Services Safety NOC", "completed": false }
  ]'::jsonb,
  '[
    { "id": "proof_1", "title": "FSSAI License Scan (PDF)", "proof_type": "pdf", "required": true },
    { "id": "proof_2", "title": "Corporation Trade License Scan (PDF)", "proof_type": "pdf", "required": true }
  ]'::jsonb
);
