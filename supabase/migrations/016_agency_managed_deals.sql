-- ============================================
-- Migration 016 — Agency-managed collabs
--
-- Some creators are represented by an agency that already raises its own
-- professional GST invoice. Those deals skip the self-service payment form;
-- instead we mark the deal agency-managed, attach the agency's GST invoice
-- (stored in Drive), and pay the agency's payout details. We still pay the
-- locked amount — there is no amount matching.
--
-- The agency's payout bank/PAN details reuse the deals.payment_details JSONB.
--
-- Safe to re-run (idempotent).
-- ============================================

ALTER TABLE deals ADD COLUMN IF NOT EXISTS agency_managed BOOLEAN DEFAULT false;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS agency_name TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS agency_gst TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS agency_invoice_url TEXT;

NOTIFY pgrst, 'reload schema';
