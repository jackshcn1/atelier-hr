alter table maintenance_jobs add column if not exists completion_type text;
alter table maintenance_jobs add column if not exists is_locked boolean default false;
alter table job_quotes add column if not exists is_approved boolean default false;
