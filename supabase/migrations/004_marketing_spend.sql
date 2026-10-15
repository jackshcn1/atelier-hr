-- Phase 1 — Marketing Module DB Migration
-- Run in Supabase SQL Editor (Dashboard)

-- 1. Marketing spend tracking (manual entries per job listing)
CREATE TABLE IF NOT EXISTS marketing_spend (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_listing_id BIGINT NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('Indeed', 'OLX', 'LinkedIn', 'Instagram', 'Newspaper', 'Other')),
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Recruitment cost per employee (total spend from all campaigns for the listing they were hired under)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS recruitment_cost NUMERIC DEFAULT 0;
