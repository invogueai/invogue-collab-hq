-- ============================================
-- Migration 010 — Fix auth lookup functions
--
-- The users table matches by email, not auth_uid.
-- The app resolves session.user.email → users row.
-- Fix get_my_role() and get_my_user_id() accordingly.
--
-- Safe to re-run (idempotent).
-- ============================================

-- 1. get_my_role() — match by email from JWT
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::json->>'user_role',
    (SELECT role FROM users WHERE lower(email) = lower(auth.jwt()->>'email')),
    'viewer'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. get_my_user_id() — match by email from JWT
CREATE OR REPLACE FUNCTION get_my_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT id FROM users WHERE lower(email) = lower(auth.jwt()->>'email'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Keep RPC locked down (re-apply revokes)
REVOKE EXECUTE ON FUNCTION get_my_role() FROM anon, public;
REVOKE EXECUTE ON FUNCTION get_my_user_id() FROM anon, public;

-- Force PostgREST to pick up changes
NOTIFY pgrst, 'reload schema';
