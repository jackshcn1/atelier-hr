-- Fix maintenance module RLS policies (Postgres doesn't support IF NOT EXISTS on CREATE POLICY)

DROP POLICY IF EXISTS "maintenance_audit_logs_insert_auth" ON maintenance_audit_logs;
CREATE POLICY "maintenance_audit_logs_insert_auth" ON maintenance_audit_logs FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "maintenance_audit_logs_update_auth" ON maintenance_audit_logs;
CREATE POLICY "maintenance_audit_logs_update_auth" ON maintenance_audit_logs FOR UPDATE TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "maintenance_audit_logs_delete_auth" ON maintenance_audit_logs;
CREATE POLICY "maintenance_audit_logs_delete_auth" ON maintenance_audit_logs FOR DELETE TO authenticated;

DROP POLICY IF EXISTS "maintenance_jobs_admin" ON maintenance_jobs;
CREATE POLICY "maintenance_jobs_admin" ON maintenance_jobs FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "maintenance_pocs_admin" ON maintenance_pocs;
CREATE POLICY "maintenance_pocs_admin" ON maintenance_pocs FOR ALL TO authenticated USING (true);
