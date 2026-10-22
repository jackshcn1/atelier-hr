CREATE TABLE IF NOT EXISTS maintenance_job_pocs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT REFERENCES maintenance_jobs(id) ON DELETE CASCADE,
  poc_id TEXT REFERENCES maintenance_pocs(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, poc_id)
);
CREATE INDEX IF NOT EXISTS idx_maintenance_job_pocs_job ON maintenance_job_pocs(job_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_job_pocs_poc ON maintenance_job_pocs(poc_id);
