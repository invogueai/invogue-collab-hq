-- ============================================
-- Migration 012 — Performance Marketer Role + Ad Tracking
--
-- Adds 'performance_marketer' role and creative/ad
-- tracking columns so the paid-media team can manage
-- influencer content across their ad pipeline.
--
-- Flow: deal goes live → ad_status = 'fresh'
--       → performance marketer moves to 'running' → 'tested'
--
-- Safe to re-run (idempotent).
-- ============================================

-- 1. Widen the users role CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'admin','negotiator','approver','finance','logistics',
    'performance_marketer',
    'viewer'
  ));

-- 2. Add ad-tracking columns to deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS ad_status TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS usage_days INTEGER DEFAULT NULL;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS usage_end_date DATE;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS ad_notes TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS ad_platform_link TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS reuse_requested BOOLEAN DEFAULT false;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS reuse_requested_at TIMESTAMPTZ;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS reuse_requested_by TEXT;

-- 3. CHECK constraint on ad_status (allow NULL for deals not yet live)
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_ad_status_check;
ALTER TABLE deals ADD CONSTRAINT deals_ad_status_check
  CHECK (ad_status IS NULL OR ad_status IN ('fresh','running','tested'));

-- 4. Index for performance marketer queries (live deals with ad_status)
CREATE INDEX IF NOT EXISTS idx_deals_ad_status ON deals(ad_status)
  WHERE ad_status IS NOT NULL;

-- 5. Force PostgREST to pick up changes
NOTIFY pgrst, 'reload schema';
