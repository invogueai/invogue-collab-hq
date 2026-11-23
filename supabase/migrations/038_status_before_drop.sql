-- 038_status_before_drop.sql
-- Remember a collab's stage before a drop was requested, so rejecting the drop
-- restores the real stage (e.g. delivered_prod / live) instead of downgrading to 'approved'.
--
-- Safe to re-run (idempotent).

alter table public.deals add column if not exists status_before_drop text;

notify pgrst, 'reload schema';
