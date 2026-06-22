-- ============================================
-- Migration 009 — Fix Supabase Linter Warnings
--
-- 1. Set explicit search_path on all SECURITY DEFINER functions
-- 2. Revoke direct RPC access on trigger-only functions
-- 3. (Leaked password protection — enable via Dashboard)
--
-- Safe to re-run (idempotent).
-- ============================================

-- =============================================
-- PART 1: Fix search_path on all functions
-- =============================================

-- 1a. get_my_role()
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::json->>'user_role',
    (SELECT role FROM users WHERE auth_uid = auth.uid()),
    'viewer'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1b. get_my_user_id()
CREATE OR REPLACE FUNCTION get_my_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT id FROM users WHERE auth_uid = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1c. is_authenticated()
CREATE OR REPLACE FUNCTION is_authenticated()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.uid() IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1d. prevent_audit_log_modification()
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Audit logs are immutable — cannot % records', TG_OP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1e. prevent_self_approval()
CREATE OR REPLACE FUNCTION prevent_self_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    IF NEW.created_by = NEW.approved_by AND NEW.approved_by IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot approve your own deal';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1f. enforce_budget_cap()
CREATE OR REPLACE FUNCTION enforce_budget_cap()
RETURNS TRIGGER AS $$
DECLARE
  camp_budget NUMERIC;
  committed NUMERIC;
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    SELECT budget INTO camp_budget FROM campaigns WHERE id = NEW.campaign_id;
    IF camp_budget IS NOT NULL THEN
      SELECT COALESCE(SUM(amount),0) INTO committed
        FROM deals
        WHERE campaign_id = NEW.campaign_id
          AND status NOT IN ('rejected','dropped','pending','renegotiate','manager_approved')
          AND id != NEW.id;
      IF (committed + NEW.amount) > camp_budget THEN
        RAISE EXCEPTION 'Deal would exceed campaign budget (committed: %, new: %, budget: %)',
          committed, NEW.amount, camp_budget;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1g. lock_deal_amount()
CREATE OR REPLACE FUNCTION lock_deal_amount()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('approved','email_sent','shipped','delivered_prod','partial_live','live',
                     'invoice_ok','invoice_pending_approval','payment_requested','payment_approved',
                     'partial_paid','paid')
     AND NEW.amount != OLD.amount THEN
    RAISE EXCEPTION 'Cannot change deal amount after approval (current status: %)', OLD.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1h. validate_payment_amount()
CREATE OR REPLACE FUNCTION validate_payment_amount()
RETURNS TRIGGER AS $$
DECLARE
  deal_amount NUMERIC;
  already_paid NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT amount INTO deal_amount FROM deals WHERE id = NEW.deal_id;
    SELECT COALESCE(SUM(amount),0) INTO already_paid
      FROM payments WHERE deal_id = NEW.deal_id AND id != NEW.id;
    IF (already_paid + NEW.amount) > deal_amount THEN
      RAISE EXCEPTION 'Total payments (% + %) would exceed deal amount (%)',
        already_paid, NEW.amount, deal_amount;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1i. block_payment_on_disputed()
CREATE OR REPLACE FUNCTION block_payment_on_disputed()
RETURNS TRIGGER AS $$
DECLARE
  deal_status TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO deal_status FROM deals WHERE id = NEW.deal_id;
    IF deal_status = 'disputed' THEN
      RAISE EXCEPTION 'Cannot add payment to a disputed deal';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1j. segregation_of_duties()
CREATE OR REPLACE FUNCTION segregation_of_duties()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT;
BEGIN
  IF NEW.status = 'payment_approved' AND OLD.status != 'payment_approved' THEN
    caller_role := get_my_role();
    IF caller_role NOT IN ('admin','finance') THEN
      RAISE EXCEPTION 'Only admin or finance can approve payments';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1k. enforce_dual_approval()
CREATE OR REPLACE FUNCTION enforce_dual_approval()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    IF NEW.amount > 50000 THEN
      caller_role := get_my_role();
      IF caller_role = 'admin' THEN
        RETURN NEW;
      END IF;
      IF OLD.status != 'manager_approved' THEN
        RAISE EXCEPTION 'Deals above ₹50,000 require dual approval — manager must approve first, then admin';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- =============================================
-- PART 2: Revoke direct RPC access on trigger functions
--
-- These are ONLY meant to fire as triggers, not be
-- called directly via PostgREST /rpc/ endpoints.
-- =============================================

REVOKE EXECUTE ON FUNCTION prevent_audit_log_modification() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION prevent_self_approval() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION enforce_budget_cap() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION lock_deal_amount() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION validate_payment_amount() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION block_payment_on_disputed() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION segregation_of_duties() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION enforce_dual_approval() FROM anon, authenticated, public;

-- Helper functions (get_my_role, get_my_user_id, is_authenticated) are used
-- inside RLS policies, so authenticated users need EXECUTE on them.
-- But anon should NOT be able to call them directly.
REVOKE EXECUTE ON FUNCTION get_my_role() FROM anon, public;
REVOKE EXECUTE ON FUNCTION get_my_user_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION is_authenticated() FROM anon, public;


-- =============================================
-- PART 3: Leaked password protection
-- =============================================
-- This must be enabled via the Supabase Dashboard:
--   Authentication → Settings → Enable "Leaked password protection"
-- Since you use Google OAuth only, this is low-priority
-- but still good practice to turn on.


-- Force PostgREST to pick up changes
NOTIFY pgrst, 'reload schema';
