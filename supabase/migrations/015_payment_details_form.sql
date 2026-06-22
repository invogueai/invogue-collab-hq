-- ============================================
-- Migration 015 — Secure influencer payment-details form
--
-- The tokenized /payment-form replaces the old query-param invoice-creator.
-- The influencer submits their bank / PAN / UPI details against an unguessable
-- token; we pay the locked (approved) amount and bulk-generate invoices on our
-- end. Invoice upload + amount matching are retired.
--
-- Flow: live → (send payment form) → influencer submits → payment_details_received → paid
--
-- Safe to re-run (idempotent).
-- ============================================

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_status_check;
ALTER TABLE deals ADD CONSTRAINT deals_status_check CHECK (status IN (
  'pending','renegotiate','manager_approved','approved','rejected',
  'email_sent','acknowledged',
  'shipped','delivered_prod','partial_live','live',
  'invoice_pending_approval','invoice_ok','disputed',
  'payment_details_received',
  'payment_requested','payment_approved','partial_paid','paid',
  'dropped','drop_requested'
));

-- Tokenized form + collected details snapshot (for bulk invoice generation)
ALTER TABLE deals ADD COLUMN IF NOT EXISTS payment_token TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS payment_token_at TIMESTAMPTZ;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS payment_details JSONB;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS payment_details_submitted_at TIMESTAMPTZ;
-- Used by the payment-request flow; add if missing so writes don't silently drop
ALTER TABLE deals ADD COLUMN IF NOT EXISTS pan_number TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS pan_name TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS payment_form_sent BOOLEAN DEFAULT false;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS payment_form_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_deals_payment_token ON deals(payment_token) WHERE payment_token IS NOT NULL;

NOTIFY pgrst, 'reload schema';
