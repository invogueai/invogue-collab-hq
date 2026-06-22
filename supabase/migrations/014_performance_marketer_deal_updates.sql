-- ============================================
-- Migration 014 — Performance Marketer deal-update access
--
-- Migration 012 added the 'performance_marketer' role and the ad-tracking
-- columns (ad_status, ad_notes, ad_platform_link, reuse_requested, …) and the
-- app UI lets that role change them. BUT the deal UPDATE RLS policy was last
-- set in migration 007 and never extended, so performance_marketer writes to
-- the deals table are silently blocked by RLS in production.
--
-- This migration recreates the "Role-based deal updates" policy with
-- performance_marketer included. No other role's access changes.
--
-- Safe to re-run (DROP POLICY IF EXISTS then CREATE).
-- ============================================

DROP POLICY IF EXISTS "Role-based deal updates" ON deals;

CREATE POLICY "Role-based deal updates" ON deals
  FOR UPDATE USING (
    get_my_role() IN ('admin','approver','finance','logistics','performance_marketer')
    OR (get_my_role() = 'negotiator' AND created_by_id = get_my_user_id())
    OR (get_my_role() = 'negotiator') -- negotiators need to update deals they work on
  );

-- Force PostgREST to pick up changes
NOTIFY pgrst, 'reload schema';
