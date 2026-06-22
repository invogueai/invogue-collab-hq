-- ============================================
-- Migration 013 — Payment Scheduling, Bank Details & TDS
--
-- Adds bank/payment fields to influencers so finance
-- can do batch exports. Adds payment_due_date and TDS
-- tracking to deals for automated scheduling.
--
-- Payment terms: next_15th | 45_days | 60_days | advance | immediate | custom
-- TDS: 10% default when cumulative FY payments > ₹50K
--
-- Safe to re-run (idempotent).
-- ============================================

-- 1. Bank details on influencers
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS bank_ifsc TEXT;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS pan_number TEXT;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS upi_id TEXT;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS default_payment_terms TEXT DEFAULT 'next_15th';

-- 2. Payment scheduling + TDS on deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS payment_due_date DATE;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS tds_rate NUMERIC DEFAULT 10;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS tds_amount NUMERIC DEFAULT 0;

-- 3. CHECK constraint on default_payment_terms
ALTER TABLE influencers DROP CONSTRAINT IF EXISTS influencers_payment_terms_check;
ALTER TABLE influencers ADD CONSTRAINT influencers_payment_terms_check
  CHECK (default_payment_terms IS NULL OR default_payment_terms IN (
    'next_15th','45_days','60_days','advance','immediate','custom'
  ));

-- 4. Index for payment due date queries (finance batch export)
CREATE INDEX IF NOT EXISTS idx_deals_payment_due_date ON deals(payment_due_date)
  WHERE payment_due_date IS NOT NULL;

-- 5. Force PostgREST to pick up changes
NOTIFY pgrst, 'reload schema';
