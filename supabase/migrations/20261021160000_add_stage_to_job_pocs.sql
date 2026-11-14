-- Reconciled 2026-11-14: poc_id stays TEXT to match maintenance_pocs.id (text).
-- The earlier UUID conversion was reverted deliberately when the FK was repaired in
-- 20261021140000_maintenance_job_pocs_join_table.sql, so it is not applied here.
ALTER TABLE maintenance_job_pocs ALTER COLUMN poc_id TYPE TEXT USING (poc_id::text);
ALTER TABLE maintenance_job_pocs ALTER COLUMN job_id TYPE TEXT USING (job_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_job_pocs_poc_id_fkey') THEN
    ALTER TABLE maintenance_job_pocs ADD CONSTRAINT maintenance_job_pocs_poc_id_fkey
      FOREIGN KEY (poc_id) REFERENCES maintenance_pocs(id) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE maintenance_job_pocs ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'New';

