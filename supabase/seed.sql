-- ============================================
-- INVOGUE COLLAB HQ — Seed Data (PRODUCTION)
-- Run this AFTER schema.sql in Supabase SQL Editor
--
-- Production installs start with ZERO demo data.
-- Insert your first admin user below (the email MUST end in @invogue.shop
-- because Google OAuth is domain-locked to that Workspace).
--
-- Every subsequent user can be added from the Admin tab inside the app.
-- ============================================

-- ── FIRST ADMIN USER ──
-- EDIT the two lines before running.
INSERT INTO users (name, email, role, status, avatar) VALUES
('REPLACE WITH ADMIN FULL NAME', 'REPLACE@invogue.shop', 'admin', 'active', 'AA');
