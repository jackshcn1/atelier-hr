-- Maintenance POCs
CREATE TABLE IF NOT EXISTS maintenance_pocs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  speciality TEXT,
  contact_primary TEXT,
  contact_alternate TEXT,
  reference TEXT,
  notes TEXT,
  star_rating INTEGER DEFAULT 5,
  attachment_url TEXT
);

-- Maintenance Jobs
CREATE TABLE IF NOT EXISTS maintenance_jobs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_serial TEXT REFERENCES assets(serial),
  service_type TEXT,
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'pending_approval',
  issues JSONB,
  comments TEXT,
  requested_by TEXT,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_poc_id TEXT REFERENCES maintenance_pocs(id)
);

-- Job Quotes
CREATE TABLE IF NOT EXISTS job_quotes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_id TEXT REFERENCES maintenance_jobs(id),
  vendor_name TEXT,
  quote_type TEXT,
  cost TEXT,
  estimated_delivery TEXT,
  status TEXT DEFAULT 'pending'
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS maintenance_audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_id TEXT REFERENCES maintenance_jobs(id),
  user_name TEXT,
  action TEXT,
  details TEXT,
  comment TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
