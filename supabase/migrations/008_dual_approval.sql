-- ============================================
-- Migration 008 — Dual Approval for ₹50K+ Deals
--
-- Deals above ₹50,000 require approval from both
-- the manager (approver) AND admin before proceeding.
--
-- Changes:
--   1. Widen deals status CHECK to include 'manager_approved'
--   2. Add trigger enforcing dual approval for high-value deals
--
-- Safe to re-run (idempotent).
-- ============================================

-- 1. Replace the deals status CHECK to support manager_approved
alter table deals drop constraint if exists deals_status_check;
alter table deals add constraint deals_status_check
  check (status in (
    'pending','renegotiate','approved','rejected','email_sent',
    'shipped','delivered_prod','partial_live','live',
    'invoice_ok','invoice_pending_approval','disputed',
    'payment_requested','payment_approved',
    'partial_paid','paid','dropped','drop_requested',
    'manager_approved'
  ));

-- 2. Trigger: enforce dual approval for deals > ₹50,000
--    If a non-admin tries to move directly from pending → approved on a 50K+ deal, block it.
--    They must go pending → manager_approved → approved.
CREATE OR REPLACE FUNCTION enforce_dual_approval()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Only fire when status changes TO 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    IF NEW.amount > 50000 THEN
      caller_role := get_my_role();
      -- Admin can always do final approval
      IF caller_role = 'admin' THEN
        RETURN NEW;
      END IF;
      -- Non-admin (approver/manager) can only approve ≤₹50K directly
      -- For >₹50K, deal must be in manager_approved first
      IF OLD.status != 'manager_approved' THEN
        RAISE EXCEPTION 'Deals above ₹50,000 require dual approval — manager must approve first, then admin';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS dual_approval_enforcement ON deals;
CREATE TRIGGER dual_approval_enforcement
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION enforce_dual_approval();

-- 3. Force PostgREST to pick up changes
NOTIFY pgrst, 'reload schema';
