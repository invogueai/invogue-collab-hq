-- ============================================
-- Migration 011 — Influencer Acknowledgement Step
--
-- Adds 'acknowledged' status + columns for the
-- influencer to confirm collaboration terms via
-- an email link before logistics can dispatch.
--
-- Flow: email_sent → (influencer clicks) → acknowledged → shipped
--
-- Safe to re-run (idempotent).
-- ============================================

-- 1. Widen the deals status CHECK constraint
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_status_check;
ALTER TABLE deals ADD CONSTRAINT deals_status_check
  CHECK (status IN (
    'pending','renegotiate','approved','rejected','email_sent',
    'acknowledged',
    'shipped','delivered_prod','partial_live','live',
    'invoice_ok','invoice_pending_approval','disputed',
    'payment_requested','payment_approved',
    'partial_paid','paid','dropped','drop_requested',
    'manager_approved'
  ));

-- 2. Add columns for acknowledgement tracking
ALTER TABLE deals ADD COLUMN IF NOT EXISTS acknowledge_token TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

-- 3. Index on token for fast lookups from the public endpoint
CREATE INDEX IF NOT EXISTS idx_deals_acknowledge_token ON deals(acknowledge_token)
  WHERE acknowledge_token IS NOT NULL;

-- 4. Force PostgREST to pick up changes
NOTIFY pgrst, 'reload schema';
