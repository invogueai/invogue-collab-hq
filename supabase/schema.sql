-- ============================================
-- INVOGUE COLLAB HQ — Database Schema (CONSOLIDATED)
-- Run this in the Supabase SQL Editor, then run seed.sql.
--
-- This file is the SINGLE SOURCE OF TRUTH for a FRESH install. It reflects the
-- full current state of the database, consolidating every change made through
-- migrations 004–013 (Google OAuth, dual approval, acknowledgement step,
-- performance-marketer role + ad tracking, payment scheduling + bank details +
-- TDS, the hardened role-based RLS, and all enforcement triggers).
--
-- The supabase/migrations/ folder is retained as the incremental history for
-- EXISTING installs that were built up step by step. A brand-new project should
-- just run this file (then seed.sql) — do NOT also replay the migrations.
--
-- ⚠️  KEEP IN SYNC: if you add a migration, fold the same change into this file
--     so a fresh install always matches a migrated one.
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- ── USERS TABLE ──
-- Authentication is handled by Supabase Auth (Google provider).
-- Sign-in is domain-locked in the app to @invogue.shop / @kreatikcommerce.com.
-- This table stores the role / status lookup, matched against auth.user.email.
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'admin','negotiator','approver','finance','logistics',
    'performance_marketer','viewer'
  )),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  avatar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── CAMPAIGNS TABLE ──
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  budget NUMERIC NOT NULL DEFAULT 0,
  target_influencers INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','paused','completed')),
  deadline DATE,
  brief TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── INFLUENCERS TABLE ──
CREATE TABLE influencers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'Instagram',
  handle TEXT,
  profile TEXT,
  followers TEXT,
  category TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  poc TEXT,
  avg_rate NUMERIC DEFAULT 0,
  rating TEXT DEFAULT 'B+',
  notes TEXT,
  tags TEXT[], -- array of tags
  -- Bank / payout details (migration 013) — used by finance batch export
  bank_account_holder TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  pan_number TEXT,
  upi_id TEXT,
  default_payment_terms TEXT DEFAULT 'next_15th'
    CHECK (default_payment_terms IS NULL OR default_payment_terms IN (
      'next_15th','45_days','60_days','advance','immediate','custom'
    )),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── DEALS TABLE ──
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_name TEXT NOT NULL,
  influencer_id UUID REFERENCES influencers(id),
  platform TEXT NOT NULL,
  followers TEXT,
  product TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','renegotiate','manager_approved','approved','rejected',
    'email_sent','acknowledged',
    'shipped','delivered_prod','partial_live','live',
    'invoice_pending_approval','invoice_ok','disputed',
    'payment_requested','payment_approved','partial_paid','paid',
    'dropped','drop_requested'
  )),
  campaign_id UUID REFERENCES campaigns(id),
  usage_rights TEXT DEFAULT '6 months',
  deadline DATE,
  profile_link TEXT,
  phone TEXT,
  address TEXT,
  created_by TEXT NOT NULL,
  created_by_id UUID REFERENCES users(id),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  -- Influencer acknowledgement step (migration 011)
  acknowledge_token TEXT,
  acknowledged_at TIMESTAMPTZ,
  -- Invoice matching
  invoice_amount NUMERIC,
  invoice_match BOOLEAN,
  invoice_at TIMESTAMPTZ,
  invoice_note TEXT,
  renegotiation_note TEXT,
  -- Performance-marketer ad tracking (migration 012)
  ad_status TEXT CHECK (ad_status IS NULL OR ad_status IN ('fresh','running','tested')),
  usage_days INTEGER DEFAULT NULL,
  usage_end_date DATE,
  ad_notes TEXT,
  ad_platform_link TEXT,
  reuse_requested BOOLEAN DEFAULT false,
  reuse_requested_at TIMESTAMPTZ,
  reuse_requested_by TEXT,
  -- Payment scheduling + TDS (migration 013)
  payment_due_date DATE,
  tds_rate NUMERIC DEFAULT 10,
  tds_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── DELIVERABLES TABLE ──
CREATE TABLE deliverables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- Reel, Story, Dedicated Video, Shorts, etc.
  description TEXT,
  -- Content-review workflow (migration 005)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','submitted','revision_requested','approved','live')),
  live_link TEXT,
  marked_live_at TIMESTAMPTZ,
  feedback TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  revision_requested_at TIMESTAMPTZ,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── PAYMENTS TABLE ──
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('advance','partial','final')),
  amount NUMERIC NOT NULL,
  note TEXT,
  processed_by TEXT,
  processed_by_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── SHIPMENTS TABLE ──
CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID UNIQUE NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL,
  tracking_id TEXT NOT NULL,
  order_id TEXT, -- courier order ID (migration 006)
  status TEXT NOT NULL DEFAULT 'in_transit' CHECK (status IN ('in_transit','delivered')),
  dispatched_by TEXT,
  dispatched_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- ── AUDIT LOG TABLE ── (append-only — see immutability trigger below)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_deals_campaign     ON deals(campaign_id);
CREATE INDEX idx_deals_status       ON deals(status);
CREATE INDEX idx_deliverables_deal  ON deliverables(deal_id);
CREATE INDEX idx_payments_deal      ON payments(deal_id);
CREATE INDEX idx_audit_deal         ON audit_log(deal_id);
CREATE INDEX idx_audit_created      ON audit_log(created_at DESC);
CREATE INDEX idx_deals_acknowledge_token ON deals(acknowledge_token) WHERE acknowledge_token IS NOT NULL;
CREATE INDEX idx_deals_ad_status         ON deals(ad_status)         WHERE ad_status IS NOT NULL;
CREATE INDEX idx_deals_payment_due_date  ON deals(payment_due_date)  WHERE payment_due_date IS NOT NULL;

-- ============================================
-- HELPER FUNCTIONS (used by RLS policies)
-- Match the active user row by the email claim in the Supabase JWT.
-- ============================================

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::json->>'user_role',
    (SELECT role FROM users WHERE lower(email) = lower(auth.jwt()->>'email') AND status = 'active'),
    'viewer'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

CREATE OR REPLACE FUNCTION get_my_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT id FROM users WHERE lower(email) = lower(auth.jwt()->>'email') AND status = 'active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

CREATE OR REPLACE FUNCTION is_authenticated()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.uid() IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

-- ============================================
-- ROW LEVEL SECURITY
-- Reads: any authenticated user (role filtering done in app for UX).
-- Writes: role-based, enforced here at the database layer.
-- ============================================
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log    ENABLE ROW LEVEL SECURITY;

-- ── READ: authenticated only ──
CREATE POLICY "Authenticated read" ON users        FOR SELECT USING (is_authenticated());
CREATE POLICY "Authenticated read" ON campaigns    FOR SELECT USING (is_authenticated());
CREATE POLICY "Authenticated read" ON influencers  FOR SELECT USING (is_authenticated());
CREATE POLICY "Authenticated read" ON deals        FOR SELECT USING (is_authenticated());
CREATE POLICY "Authenticated read" ON deliverables FOR SELECT USING (is_authenticated());
CREATE POLICY "Authenticated read" ON payments     FOR SELECT USING (is_authenticated());
CREATE POLICY "Authenticated read" ON shipments    FOR SELECT USING (is_authenticated());
CREATE POLICY "Authenticated read" ON audit_log    FOR SELECT USING (is_authenticated());

-- ── USERS: admin only ──
CREATE POLICY "Admin manages users" ON users FOR INSERT WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Admin updates users" ON users FOR UPDATE USING (get_my_role() = 'admin');
CREATE POLICY "Admin deletes users" ON users FOR DELETE USING (get_my_role() = 'admin');

-- ── CAMPAIGNS: admin + approver manage, admin deletes ──
CREATE POLICY "Admin/approver manage campaigns" ON campaigns FOR INSERT WITH CHECK (get_my_role() IN ('admin','approver'));
CREATE POLICY "Admin/approver update campaigns" ON campaigns FOR UPDATE USING (get_my_role() IN ('admin','approver'));
CREATE POLICY "Admin deletes campaigns" ON campaigns FOR DELETE USING (get_my_role() = 'admin');

-- ── INFLUENCERS: admin + negotiator manage (approver may update), admin deletes ──
CREATE POLICY "Admin/negotiator manage influencers" ON influencers FOR INSERT WITH CHECK (get_my_role() IN ('admin','negotiator'));
CREATE POLICY "Admin/negotiator update influencers" ON influencers FOR UPDATE USING (get_my_role() IN ('admin','negotiator','approver'));
CREATE POLICY "Admin deletes influencers" ON influencers FOR DELETE USING (get_my_role() = 'admin');

-- ── DEALS: role-based ──
CREATE POLICY "Negotiator/admin create deals" ON deals
  FOR INSERT WITH CHECK (get_my_role() IN ('admin','negotiator'));
-- performance_marketer is included so the paid-media team can update ad_status,
-- ad notes/links and request usage extensions on live deals (added in migration 014;
-- migration 012 introduced the role but missed this policy).
CREATE POLICY "Role-based deal updates" ON deals
  FOR UPDATE USING (
    get_my_role() IN ('admin','approver','finance','logistics','performance_marketer')
    OR (get_my_role() = 'negotiator' AND created_by_id = get_my_user_id())
    OR (get_my_role() = 'negotiator') -- negotiators need to update deals they work on
  );
CREATE POLICY "Admin deletes deals" ON deals FOR DELETE USING (get_my_role() = 'admin');

-- ── DELIVERABLES: negotiator/admin create, approver may update, admin deletes ──
CREATE POLICY "Create deliverables" ON deliverables FOR INSERT WITH CHECK (get_my_role() IN ('admin','negotiator'));
CREATE POLICY "Update deliverables" ON deliverables FOR UPDATE USING (get_my_role() IN ('admin','negotiator','approver'));
CREATE POLICY "Admin deletes deliverables" ON deliverables FOR DELETE USING (get_my_role() = 'admin');

-- ── PAYMENTS: finance + admin INSERT only — immutable (no update/delete policy) ──
CREATE POLICY "Finance/admin record payments" ON payments FOR INSERT WITH CHECK (get_my_role() IN ('admin','finance'));

-- ── SHIPMENTS: logistics + admin (no delete policy) ──
CREATE POLICY "Logistics/admin manage shipments" ON shipments FOR INSERT WITH CHECK (get_my_role() IN ('admin','logistics'));
CREATE POLICY "Logistics/admin update shipments" ON shipments FOR UPDATE USING (get_my_role() IN ('admin','logistics'));

-- ── AUDIT_LOG: append-only (INSERT for any authenticated user, no update/delete policy) ──
CREATE POLICY "Anyone can insert audit log" ON audit_log FOR INSERT WITH CHECK (is_authenticated());

-- ============================================
-- ENFORCEMENT TRIGGERS (business rules at the DB layer)
-- ============================================

-- 1. Audit log is immutable (belt-and-suspenders with the missing update/delete policies)
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Audit logs are immutable — cannot % records', TG_OP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- 2. Prevent self-approval of a deal
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

DROP TRIGGER IF EXISTS no_self_approval ON deals;
CREATE TRIGGER no_self_approval
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION prevent_self_approval();

-- 3. Enforce campaign budget cap on approval
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

DROP TRIGGER IF EXISTS budget_cap_enforcement ON deals;
CREATE TRIGGER budget_cap_enforcement
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION enforce_budget_cap();

-- 4. Lock deal amount after approval (renegotiation back to pending unlocks it)
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

DROP TRIGGER IF EXISTS deal_amount_lock ON deals;
CREATE TRIGGER deal_amount_lock
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION lock_deal_amount();

-- 5. Total payments can never exceed the deal amount
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

DROP TRIGGER IF EXISTS payment_amount_validation ON payments;
CREATE TRIGGER payment_amount_validation
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION validate_payment_amount();

-- 6. Block payment on a disputed deal
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

DROP TRIGGER IF EXISTS payment_deal_status_check ON payments;
CREATE TRIGGER payment_deal_status_check
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION block_payment_on_disputed();

-- 7. Only admin/finance can move a deal to payment_approved (segregation of duties)
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

DROP TRIGGER IF EXISTS duty_segregation ON deals;
CREATE TRIGGER duty_segregation
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION segregation_of_duties();

-- 8. Dual approval for deals above ₹50,000 (manager_approved → approved, admin can finalize)
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

DROP TRIGGER IF EXISTS dual_approval_enforcement ON deals;
CREATE TRIGGER dual_approval_enforcement
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION enforce_dual_approval();

-- ============================================
-- LOCK DOWN DIRECT RPC ACCESS
-- Trigger-only functions must never be callable via PostgREST /rpc/.
-- Helper functions are used inside RLS so authenticated needs EXECUTE, anon does not.
-- ============================================
REVOKE EXECUTE ON FUNCTION prevent_audit_log_modification() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION prevent_self_approval()          FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION enforce_budget_cap()             FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION lock_deal_amount()               FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION validate_payment_amount()        FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION block_payment_on_disputed()      FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION segregation_of_duties()          FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION enforce_dual_approval()          FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION get_my_role()      FROM anon, public;
REVOKE EXECUTE ON FUNCTION get_my_user_id()   FROM anon, public;
REVOKE EXECUTE ON FUNCTION is_authenticated() FROM anon, public;

-- Force PostgREST to pick up the schema immediately
NOTIFY pgrst, 'reload schema';

