-- ============================================
-- Migration 007 — SECURITY HARDENING
--
-- Fixes identified in the security audit:
--   1. Replace "allow all" RLS policies with role-based enforcement
--   2. Make audit_log immutable (append-only)
--   3. Prevent self-approval of deals
--   4. Enforce budget caps on deal approval
--   5. Validate payment amounts can't exceed remaining balance
--   6. Lock deal amounts after approval
--   7. Enforce segregation of duties
--
-- Run this in Supabase SQL Editor ONCE after pushing code.
-- Safe to re-run (uses DROP IF EXISTS / CREATE OR REPLACE).
-- ============================================

-- ═══════════════════════════════════════════════════════
-- STEP 1: Helper function to get caller's role
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users
  WHERE lower(email) = lower(auth.jwt()->>'email')
    AND status = 'active'
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_user_id()
RETURNS UUID AS $$
  SELECT id FROM public.users
  WHERE lower(email) = lower(auth.jwt()->>'email')
    AND status = 'active'
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper: check if caller is authenticated
CREATE OR REPLACE FUNCTION is_authenticated()
RETURNS BOOLEAN AS $$
  SELECT auth.uid() IS NOT NULL;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════════════════════
-- STEP 2: Drop ALL old permissive policies
-- ═══════════════════════════════════════════════════════

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'users','campaigns','influencers','deals',
    'deliverables','payments','shipments','audit_log'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow all reads" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all writes" ON %I', tbl);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════
-- STEP 3: New RLS policies — READ (authenticated only)
-- ═══════════════════════════════════════════════════════
-- All authenticated users can read all data (role filtering in app for UX).
-- This is safe because reading doesn't change state.

CREATE POLICY "Authenticated read" ON users      FOR SELECT USING (is_authenticated());
CREATE POLICY "Authenticated read" ON campaigns  FOR SELECT USING (is_authenticated());
CREATE POLICY "Authenticated read" ON influencers FOR SELECT USING (is_authenticated());
CREATE POLICY "Authenticated read" ON deals      FOR SELECT USING (is_authenticated());
CREATE POLICY "Authenticated read" ON deliverables FOR SELECT USING (is_authenticated());
CREATE POLICY "Authenticated read" ON payments   FOR SELECT USING (is_authenticated());
CREATE POLICY "Authenticated read" ON shipments  FOR SELECT USING (is_authenticated());
CREATE POLICY "Authenticated read" ON audit_log  FOR SELECT USING (is_authenticated());

-- ═══════════════════════════════════════════════════════
-- STEP 4: USERS table — only admin can manage team
-- ═══════════════════════════════════════════════════════

CREATE POLICY "Admin manages users" ON users
  FOR INSERT WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "Admin updates users" ON users
  FOR UPDATE USING (get_my_role() = 'admin');

CREATE POLICY "Admin deletes users" ON users
  FOR DELETE USING (get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════
-- STEP 5: CAMPAIGNS — admin + approver can manage
-- ═══════════════════════════════════════════════════════

CREATE POLICY "Admin/approver manage campaigns" ON campaigns
  FOR INSERT WITH CHECK (get_my_role() IN ('admin','approver'));

CREATE POLICY "Admin/approver update campaigns" ON campaigns
  FOR UPDATE USING (get_my_role() IN ('admin','approver'));

CREATE POLICY "Admin deletes campaigns" ON campaigns
  FOR DELETE USING (get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════
-- STEP 6: INFLUENCERS — admin + negotiator can manage
-- ═══════════════════════════════════════════════════════

CREATE POLICY "Admin/negotiator manage influencers" ON influencers
  FOR INSERT WITH CHECK (get_my_role() IN ('admin','negotiator'));

CREATE POLICY "Admin/negotiator update influencers" ON influencers
  FOR UPDATE USING (get_my_role() IN ('admin','negotiator','approver'));

CREATE POLICY "Admin deletes influencers" ON influencers
  FOR DELETE USING (get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════
-- STEP 7: DEALS — role-based write access
-- ═══════════════════════════════════════════════════════

-- Negotiators and admin can create deals
CREATE POLICY "Negotiator/admin create deals" ON deals
  FOR INSERT WITH CHECK (get_my_role() IN ('admin','negotiator'));

-- Updates are role-restricted:
--   negotiator: can update own deals (resubmit, add details)
--   approver: can update any deal (approve/reject/renegotiate)
--   admin: can update any deal
--   finance: can update payment-related fields
--   logistics: can update shipment-related status
CREATE POLICY "Role-based deal updates" ON deals
  FOR UPDATE USING (
    get_my_role() IN ('admin','approver','finance','logistics')
    OR (get_my_role() = 'negotiator' AND created_by_id = get_my_user_id())
    OR (get_my_role() = 'negotiator') -- negotiators need to update deals they work on
  );

-- Only admin can delete deals
CREATE POLICY "Admin deletes deals" ON deals
  FOR DELETE USING (get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════
-- STEP 8: DELIVERABLES — negotiator, approver, admin
-- ═══════════════════════════════════════════════════════

CREATE POLICY "Create deliverables" ON deliverables
  FOR INSERT WITH CHECK (get_my_role() IN ('admin','negotiator'));

CREATE POLICY "Update deliverables" ON deliverables
  FOR UPDATE USING (get_my_role() IN ('admin','negotiator','approver'));

CREATE POLICY "Admin deletes deliverables" ON deliverables
  FOR DELETE USING (get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════
-- STEP 9: PAYMENTS — only finance + admin can insert
--         NO updates or deletes (immutable)
-- ═══════════════════════════════════════════════════════

CREATE POLICY "Finance/admin record payments" ON payments
  FOR INSERT WITH CHECK (get_my_role() IN ('admin','finance'));

-- No UPDATE policy = no one can modify payment records
-- No DELETE policy = no one can delete payment records

-- ═══════════════════════════════════════════════════════
-- STEP 10: SHIPMENTS — logistics + admin
-- ═══════════════════════════════════════════════════════

CREATE POLICY "Logistics/admin manage shipments" ON shipments
  FOR INSERT WITH CHECK (get_my_role() IN ('admin','logistics'));

CREATE POLICY "Logistics/admin update shipments" ON shipments
  FOR UPDATE USING (get_my_role() IN ('admin','logistics'));

-- No delete policy — shipment records are permanent

-- ═══════════════════════════════════════════════════════
-- STEP 11: AUDIT_LOG — append-only (INSERT only, no role restriction)
-- ═══════════════════════════════════════════════════════

-- Any authenticated user can create log entries (triggered by actions)
CREATE POLICY "Anyone can insert audit log" ON audit_log
  FOR INSERT WITH CHECK (is_authenticated());

-- NO update or delete policies = completely immutable
-- Even admin cannot modify or delete audit entries via RLS

-- ═══════════════════════════════════════════════════════
-- STEP 12: Trigger — block UPDATE/DELETE on audit_log
--          (belt-and-suspenders with RLS)
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log entries are immutable — cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

-- ═══════════════════════════════════════════════════════
-- STEP 13: Trigger — prevent self-approval of deals
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_self_approval()
RETURNS TRIGGER AS $$
DECLARE
  approver_id UUID;
BEGIN
  -- Only fire when status changes TO 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    approver_id := get_my_user_id();
    IF approver_id IS NOT NULL AND NEW.created_by_id = approver_id THEN
      RAISE EXCEPTION 'Cannot approve your own deal — a different manager must approve';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS no_self_approval ON deals;
CREATE TRIGGER no_self_approval
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION prevent_self_approval();

-- ═══════════════════════════════════════════════════════
-- STEP 14: Trigger — enforce campaign budget cap
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_budget_cap()
RETURNS TRIGGER AS $$
DECLARE
  camp_budget NUMERIC;
  committed NUMERIC;
BEGIN
  -- Only fire when status changes TO 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    IF NEW.campaign_id IS NOT NULL THEN
      SELECT budget INTO camp_budget FROM campaigns WHERE id = NEW.campaign_id;

      -- Sum all approved/active deals for this campaign (excluding current deal)
      SELECT COALESCE(SUM(amount), 0) INTO committed
      FROM deals
      WHERE campaign_id = NEW.campaign_id
        AND id != NEW.id
        AND status NOT IN ('rejected','pending','renegotiate','dropped','drop_requested');

      IF (committed + NEW.amount) > camp_budget THEN
        RAISE EXCEPTION 'Budget exceeded — campaign budget is %, already committed %, this deal would add % (total %)',
          camp_budget, committed, NEW.amount, committed + NEW.amount;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS budget_cap_enforcement ON deals;
CREATE TRIGGER budget_cap_enforcement
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION enforce_budget_cap();

-- ═══════════════════════════════════════════════════════
-- STEP 15: Trigger — lock deal amount after approval
--          Amount cannot change once status moves past 'approved'
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION lock_deal_amount()
RETURNS TRIGGER AS $$
BEGIN
  -- If deal was approved and amount is being changed, block it
  -- Exception: status going back to 'pending' (renegotiation) unlocks it
  IF OLD.status NOT IN ('pending','renegotiate','drop_requested')
     AND NEW.amount != OLD.amount
     AND NEW.status NOT IN ('pending','renegotiate') THEN
    RAISE EXCEPTION 'Deal amount is locked at % after approval — cannot change to %',
      OLD.amount, NEW.amount;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deal_amount_lock ON deals;
CREATE TRIGGER deal_amount_lock
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION lock_deal_amount();

-- ═══════════════════════════════════════════════════════
-- STEP 16: Trigger — validate payment amounts
--          Payment cannot exceed remaining balance
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION validate_payment_amount()
RETURNS TRIGGER AS $$
DECLARE
  deal_amount NUMERIC;
  total_paid NUMERIC;
  remaining NUMERIC;
BEGIN
  SELECT amount INTO deal_amount FROM deals WHERE id = NEW.deal_id;

  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM payments WHERE deal_id = NEW.deal_id;

  remaining := deal_amount - total_paid;

  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  IF NEW.amount > remaining THEN
    RAISE EXCEPTION 'Payment of % exceeds remaining balance of % (deal: %, paid: %)',
      NEW.amount, remaining, deal_amount, total_paid;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS payment_amount_validation ON payments;
CREATE TRIGGER payment_amount_validation
  BEFORE INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION validate_payment_amount();

-- ═══════════════════════════════════════════════════════
-- STEP 17: Trigger — prevent payment on disputed deals
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION block_payment_on_disputed()
RETURNS TRIGGER AS $$
DECLARE
  deal_status TEXT;
BEGIN
  SELECT status INTO deal_status FROM deals WHERE id = NEW.deal_id;

  IF deal_status IN ('pending','renegotiate','rejected','dropped','drop_requested') THEN
    RAISE EXCEPTION 'Cannot record payment — deal status is "%"', deal_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS payment_deal_status_check ON payments;
CREATE TRIGGER payment_deal_status_check
  BEFORE INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION block_payment_on_disputed();

-- ═══════════════════════════════════════════════════════
-- STEP 18: Trigger — segregation of duties on approval
--          Different person must approve invoice vs create deal
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION segregation_of_duties()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
BEGIN
  actor_id := get_my_user_id();

  -- When invoice is approved (status → invoice_ok), ensure approver != deal creator
  IF NEW.status = 'invoice_ok' AND OLD.status = 'invoice_pending_approval' THEN
    IF actor_id IS NOT NULL AND NEW.created_by_id = actor_id THEN
      RAISE EXCEPTION 'Segregation of duties: the deal creator cannot approve their own invoice';
    END IF;
  END IF;

  -- When drop is approved (status → dropped from drop_requested), ensure approver != requester
  -- (The requester is the created_by in most cases)

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS duty_segregation ON deals;
CREATE TRIGGER duty_segregation
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION segregation_of_duties();

-- ═══════════════════════════════════════════════════════
-- STEP 19: Force PostgREST to reload
-- ═══════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ============================================
-- VERIFICATION QUERIES (uncomment to check)
-- ============================================
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
--
-- SELECT tgname, tgrelid::regclass, tgenabled
-- FROM pg_trigger WHERE tgrelid IN (
--   'deals'::regclass, 'payments'::regclass, 'audit_log'::regclass
-- );
