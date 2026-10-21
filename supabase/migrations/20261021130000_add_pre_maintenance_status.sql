ALTER TABLE assets ADD COLUMN IF NOT EXISTS pre_maintenance_status TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_pre_maintenance ON assets(pre_maintenance_status) WHERE pre_maintenance_status IS NOT NULL;
