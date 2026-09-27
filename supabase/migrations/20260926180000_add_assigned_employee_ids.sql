-- Migration: Add multi-employee group assignment to checklist_templates
-- Created: 2026-09-26

alter table checklist_templates
  add column if not exists assigned_employee_ids jsonb default '[]'::jsonb;
