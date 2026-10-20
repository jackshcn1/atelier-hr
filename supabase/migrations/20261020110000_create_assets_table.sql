CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  name TEXT,
  serial_number TEXT UNIQUE,
  asset_number TEXT UNIQUE,
  status TEXT DEFAULT 'Available'
);

-- Seed data for mock assets
INSERT INTO assets (id, name, serial_number, asset_number, status)
VALUES 
  ('KICH00001', 'Chiller', 'KICH00001', 'KICH00001', 'Available'),
  ('KICH00002', 'Chiller', 'KICH00002', 'KICH00002', 'In-use')
ON CONFLICT (id) DO NOTHING;
