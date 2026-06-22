-- ============================================
-- Migration 005 — Fix deliverable review workflow
--
-- The original schema.sql locked `deliverables.status` to
-- ('pending','live','approved') and didn't have any columns for the
-- content-approval flow. That means "Submit for Review" and
-- "Request Revision" silently failed at the DB layer — the UI
-- updated but nothing persisted.
--
-- This migration:
--   • Widens the status CHECK to cover the full workflow
--   • Adds feedback / submitted_at / approved_at / revision_requested_at
--   • Adds history (JSONB) so the activity trail survives a refresh
-- ============================================

-- 1. Replace the too-narrow CHECK constraint
alter table deliverables drop constraint if exists deliverables_status_check;
alter table deliverables add constraint deliverables_status_check
  check (status in ('pending','submitted','revision_requested','approved','live'));

-- 2. Add the missing columns (idempotent — safe to re-run)
alter table deliverables add column if not exists feedback text;
alter table deliverables add column if not exists submitted_at timestamptz;
alter table deliverables add column if not exists approved_at timestamptz;
alter table deliverables add column if not exists revision_requested_at timestamptz;
alter table deliverables add column if not exists history jsonb not null default '[]'::jsonb;

-- 3. Force PostgREST to pick up the new columns immediately
notify pgrst, 'reload schema';

-- Verify
-- select column_name, data_type from information_schema.columns
--  where table_name='deliverables' order by ordinal_position;
