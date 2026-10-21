CREATE POLICY IF NOT EXISTS "maintenance_audit_logs_insert_auth" ON maintenance_audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "maintenance_audit_logs_update_auth" ON maintenance_audit_logs FOR UPDATE TO authenticated WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "maintenance_audit_logs_delete_auth" ON maintenance_audit_logs FOR DELETE TO authenticated WITH CHECK (true);
