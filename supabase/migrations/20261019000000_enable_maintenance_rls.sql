ALTER TABLE maintenance_pocs ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "maintenance_jobs_select_auth" ON maintenance_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "maintenance_pocs_select_auth" ON maintenance_pocs FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "job_quotes_select_auth" ON job_quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "maintenance_audit_logs_select_auth" ON maintenance_audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "maintenance_jobs_insert_auth" ON maintenance_jobs FOR INSERT TO authenticated WITH CHECK (true);
