ALTER TABLE maintenance_job_pocs ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'New';
