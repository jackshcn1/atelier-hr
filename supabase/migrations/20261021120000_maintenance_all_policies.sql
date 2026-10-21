-- Audit log missing insert/update/delete (previous IF NOT EXISTS syntax failed; use plain policies)
DROP POLICY IF EXISTS "maintenance_audit_logs_insert_auth" ON maintenance_audit_logs;
CREATE POLICY "maintenance_audit_logs_insert_auth" ON maintenance_audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "maintenance_audit_logs_update_auth" ON maintenance_audit_logs FOR UPDATE TO authenticated WITH CHECK (true);
CREATE POLICY "maintenance_audit_logs_delete_auth" ON maintenance_audit_logs FOR DELETE TO authenticated WITH CHECK (true);

-- Companion: full-access policies for remaining maintenance tables (supabase-schema.sql has them, migrations lack them)
CREATE POLICY IF NOT EXISTS "maintenance_jobs_admin" ON maintenance_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "maintenance_pocs_admin" ON maintenance_pocs FOR ALL TO authenticated USING (true) WITH CHECK (true);
