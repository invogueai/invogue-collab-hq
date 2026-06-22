-- ============================================
-- Migration 006 — Workflow enhancements
--
-- This migration:
--   • Widens the deals status CHECK to include drop_requested + invoice_pending_approval
--   • Adds order_id column to shipments table
--
-- Safe to re-run (idempotent).
-- ============================================

-- 1. Replace the deals status CHECK to support new workflow states
alter table deals drop constraint if exists deals_status_check;
alter table deals add constraint deals_status_check
  check (status in (
    'pending','renegotiate','approved','rejected','email_sent',
    'shipped','delivered_prod','partial_live','live',
    'invoice_ok','invoice_pending_approval','disputed',
    'payment_requested','payment_approved',
    'partial_paid','paid','dropped','drop_requested'
  ));

-- 2. Add order_id to shipments (logistics can record courier order ID)
alter table shipments add column if not exists order_id text;

-- 3. Force PostgREST to pick up changes
notify pgrst, 'reload schema';
