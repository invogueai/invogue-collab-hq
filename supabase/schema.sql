-- ============================================
-- INVOGUE COLLAB HQ — Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── USERS TABLE ──
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  pin TEXT DEFAULT '1111',
  role TEXT NOT NULL CHECK (role IN ('admin','negotiator','approver','finance','logistics','viewer')),
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
    'pending','renegotiate','approved','rejected','email_sent',
    'shipped','delivered_prod','partial_live','live',
    'invoice_ok','disputed','partial_paid','paid'
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
  invoice_amount NUMERIC,
  invoice_match BOOLEAN,
  invoice_at TIMESTAMPTZ,
  invoice_note TEXT,
  renegotiation_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── DELIVERABLES TABLE ──
CREATE TABLE deliverables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- Reel, Story, Dedicated Video, Shorts, etc.
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','live','approved')),
  live_link TEXT,
  marked_live_at TIMESTAMPTZ,
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
  status TEXT NOT NULL DEFAULT 'in_transit' CHECK (status IN ('in_transit','delivered')),
  dispatched_by TEXT,
  dispatched_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- ── AUDIT LOG TABLE ──
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── INDEXES ──
CREATE INDEX idx_deals_campaign ON deals(campaign_id);
CREATE INDEX idx_deals_status ON deals(status);
CREATE INDEX idx_deliverables_deal ON deliverables(deal_id);
CREATE INDEX idx_payments_deal ON payments(deal_id);
CREATE INDEX idx_audit_deal ON audit_log(deal_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- ── ROW LEVEL SECURITY ──
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read all data (role filtering done in app)
CREATE POLICY "Allow all reads" ON users FOR SELECT USING (true);
CREATE POLICY "Allow all reads" ON campaigns FOR SELECT USING (true);
CREATE POLICY "Allow all reads" ON influencers FOR SELECT USING (true);
CREATE POLICY "Allow all reads" ON deals FOR SELECT USING (true);
CREATE POLICY "Allow all reads" ON deliverables FOR SELECT USING (true);
CREATE POLICY "Allow all reads" ON payments FOR SELECT USING (true);
CREATE POLICY "Allow all reads" ON shipments FOR SELECT USING (true);
CREATE POLICY "Allow all reads" ON audit_log FOR SELECT USING (true);

-- Allow all authenticated users to insert/update (role enforcement done in app)
CREATE POLICY "Allow all writes" ON users FOR ALL USING (true);
CREATE POLICY "Allow all writes" ON campaigns FOR ALL USING (true);
CREATE POLICY "Allow all writes" ON influencers FOR ALL USING (true);
CREATE POLICY "Allow all writes" ON deals FOR ALL USING (true);
CREATE POLICY "Allow all writes" ON deliverables FOR ALL USING (true);
CREATE POLICY "Allow all writes" ON payments FOR ALL USING (true);
CREATE POLICY "Allow all writes" ON shipments FOR ALL USING (true);
CREATE POLICY "Allow all writes" ON audit_log FOR ALL USING (true);
