-- Migration: Interactive Daily & Shift Checklists Module
-- Created: 2026-09-26

-- 1. Checklist Templates Table
create table if not exists checklist_templates (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  department text references departments(name) on update cascade on delete set null,
  cadence text not null check (cadence in ('daily_once', 'daily_multiple', 'weekly', 'monthly')),
  schedule_times jsonb default '["23:00"]'::jsonb,
  rollover_if_missed boolean default true,
  assigned_type text default 'department' check (assigned_type in ('individual', 'department', 'all_staff')),
  assigned_employee_id text references employees(employee_id) on update cascade on delete set null,
  assigned_department text references departments(name) on update cascade on delete set null,
  requires_approval boolean default false,
  approver_role text default 'manager',
  approver_employee_id text references employees(employee_id) on update cascade on delete set null,
  items jsonb not null default '[]'::jsonb,
  is_active boolean default true,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Checklist Execution Runs Table
create table if not exists checklist_runs (
  id bigint generated always as identity primary key,
  template_id bigint references checklist_templates(id) on delete cascade,
  title text not null,
  department text,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'overdue', 'pending_approval', 'completed', 'missed', 'recheck_requested')),
  submitted_by text,
  submitted_by_name text,
  submitted_at timestamptz,
  approved_by text,
  approved_by_name text,
  approved_at timestamptz,
  recheck_notes text,
  is_overdue boolean default false,
  delay_seconds numeric default 0,
  responses jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Dismissed Banner Notifications Table
create table if not exists checklist_notifications_dismissed (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  run_id bigint references checklist_runs(id) on delete cascade,
  dismissed_at timestamptz default now(),
  unique (user_id, run_id)
);

-- 4. Enable Row Level Security
alter table checklist_templates enable row level security;
alter table checklist_runs enable row level security;
alter table checklist_notifications_dismissed enable row level security;

-- 5. RLS Policies
create policy "checklist_templates_select" on checklist_templates for select using (auth.role() = 'authenticated');
create policy "checklist_templates_write" on checklist_templates for all using (is_admin() or has_permission('manage_documents') or has_permission('manage_track_record'));

create policy "checklist_runs_select" on checklist_runs for select using (auth.role() = 'authenticated');
create policy "checklist_runs_write" on checklist_runs for all using (auth.role() = 'authenticated');

create policy "checklist_notifications_dismissed_all" on checklist_notifications_dismissed for all using (auth.uid() = user_id);

-- 6. Insert Authentic Starter Templates
insert into checklist_templates (title, description, department, cadence, schedule_times, rollover_if_missed, assigned_type, assigned_department, requires_approval, items)
values
(
  'Kitchen Night Station Closing & Sanitization',
  'Daily kitchen closing protocol, equipment shutdown, temperature logs, and photographic proof of sanitization.',
  'Kitchen',
  'daily_once',
  '["23:00"]'::jsonb,
  true,
  'department',
  'Kitchen',
  true,
  '[
    {
      "id": "item_1",
      "title": "Temperature Logs & Refrigeration",
      "type": "heading",
      "subtasks": [
        { "id": "st_1a", "title": "Walk-in Cooler Temperature Log", "type": "temperature", "min_val": 1, "max_val": 4, "required": true },
        { "id": "st_1b", "title": "Deep Freezer Temperature Log", "type": "temperature", "min_val": -22, "max_val": -18, "required": true },
        { "id": "st_1c", "title": "Verify all cold unit doors are tightly gasket-sealed", "type": "checkbox", "required": true }
      ]
    },
    {
      "id": "item_2",
      "title": "Station Deep Clean & Food Storage",
      "type": "heading",
      "subtasks": [
        { "id": "st_2a", "title": "FIFO Stock Rotation: All prep tubs labeled with name & date", "type": "checkbox", "required": true },
        { "id": "st_2b", "title": "Fryer filtered, drained, and switched off", "type": "checkbox", "required": true },
        { "id": "st_2c", "title": "Exhaust hood vents & grill surfaces degreased", "type": "checkbox", "required": true }
      ]
    },
    {
      "id": "item_3",
      "title": "Photographic Proof of Station Cleanliness",
      "type": "heading",
      "subtasks": [
        { "id": "st_3a", "title": "Photo: Sandwich & Prep Counter", "type": "photo", "required": true },
        { "id": "st_3b", "title": "Photo: Fryer & Hot Range Area", "type": "photo", "required": true },
        { "id": "st_3c", "title": "Photo: Dishwash & Pot Wash Sink Area", "type": "photo", "required": true }
      ]
    },
    {
      "id": "item_4",
      "title": "Final Lockup & Gas Safety",
      "type": "heading",
      "subtasks": [
        { "id": "st_4a", "title": "Main LPG gas valve physically closed and locked", "type": "checkbox", "required": true },
        { "id": "st_4b", "title": "Trash bins emptied, washed, and new liners installed", "type": "checkbox", "required": true }
      ]
    }
  ]'::jsonb
),
(
  'Daily Staff Grooming & Uniform Inspection',
  'Daily shift start grooming check for all duty staff. Does NOT roll over if shift is missed.',
  null,
  'daily_once',
  '["11:30"]'::jsonb,
  false,
  'all_staff',
  null,
  true,
  '[
    {
      "id": "groom_1",
      "title": "Uniform & Appearance Check",
      "type": "heading",
      "subtasks": [
        { "id": "gst_1", "title": "Clean, ironed company uniform and apron worn", "type": "checkbox", "required": true },
        { "id": "gst_2", "title": "Hair neatly tied / hairnet worn in kitchen areas", "type": "checkbox", "required": true },
        { "id": "gst_3", "title": "Nails trimmed, clean, and no chipped nail polish", "type": "checkbox", "required": true },
        { "id": "gst_4", "title": "Enclosed, slip-resistant footwear worn", "type": "checkbox", "required": true }
      ]
    }
  ]'::jsonb
);
