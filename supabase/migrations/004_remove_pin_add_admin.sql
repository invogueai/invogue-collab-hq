-- ============================================
-- Migration 004 — Remove PIN auth, add admin user
--
-- Run this in Supabase SQL Editor AFTER you've:
--   1. Enabled the Google provider in Supabase dashboard
--      (Authentication → Providers → Google)
--   2. Added the Supabase callback URL to your Google Cloud
--      Console OAuth client's Authorized redirect URIs
--      (see GOOGLE_AUTH_SETUP.md for full walk-through)
--
-- What this does:
--   • Wipes every demo/seed user (clean slate for production)
--   • Drops the legacy `pin` column (we're on Google OAuth now)
--   • Inserts the first admin so that the very first Google sign-in
--     has a matching row in the `users` table (otherwise the app
--     blocks every login as "not authorized")
-- ============================================

-- 1. Clean slate
delete from users;

-- 2. Drop the pin column
alter table users drop column if exists pin;

-- 3. Seed the first admin.
--    EDIT the two lines below before running — the email MUST end in
--    @invogue.shop (the app enforces this and Google OAuth is hd-locked
--    to that Workspace domain).
insert into users (id, name, email, role, status, avatar)
values (
  gen_random_uuid(),
  'REPLACE WITH ADMIN FULL NAME',       -- e.g. 'Maadhav Saxena'
  'REPLACE@invogue.shop',                -- must be @invogue.shop
  'admin',
  'active',
  'AA'                                   -- 2-letter initials shown in the UI
);

-- 4. Force PostgREST to pick up the column drop immediately
notify pgrst, 'reload schema';

-- Verify
-- select id, name, email, role, status from users;
