ALTER TABLE maintenance_job_pocs ALTER COLUMN poc_id TYPE UUID USING (poc_id::uuid);
ALTER TABLE maintenance_job_pocs ALTER COLUMN job_id TYPE TEXT USING (job_id);
ALTER TABLE maintenance_job_pocs ADD CONSTRAINT maintenance_job_pocs_poc_id_fkey FOREIGN KEY (poc_id) REFERENCES maintenance_pocs(id) ON DELETE CASCADE;
ALTER TABLE maintenance_job_pocs ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'New';

