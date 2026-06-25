-- 017_soft_delete.sql
-- Admin-only soft delete for collabs (deals) and campaigns.
-- Deleted rows are hidden from every list, budget and analytic in the app,
-- but retained in the database and restorable from Admin → Deleted.

ALTER TABLE deals     ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;

-- Speed up the active/deleted split on load.
CREATE INDEX IF NOT EXISTS idx_deals_deleted     ON deals(deleted);
CREATE INDEX IF NOT EXISTS idx_campaigns_deleted ON campaigns(deleted);
