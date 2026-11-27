-- The reminder markers on the compliance register.
--
-- A reminder must not nag: the same item must not produce two tasks, and the
-- owner must not be told about the same thing every morning. So each item
-- remembers the task it created, and when it was last told about it.
--
--   reminder_task_id     the task in the Tasks hub that stands for this item
--   reminder_notified_at  when the owner was last told about it by email

alter table compliance_items
  add column if not exists reminder_task_id bigint;

alter table compliance_items
  add column if not exists reminder_notified_at timestamptz;

create index if not exists compliance_items_reminder_idx on compliance_items (reminder_task_id);
