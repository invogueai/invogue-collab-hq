-- 034_deal_handover.sql
-- Deal handover / transfer between team members.
--   assigned_to      — current handler. NULL = still owned by created_by.
--                      "My Collabs" is driven by (assigned_to || created_by).
--   transferred_from — the owner the collab was handed over FROM (for the badge).
--   transferred_at / transferred_by — when, and which admin performed it.
--
-- Analytics attribution stays on created_by (unchanged) so a receiving employee
-- never gets credit for a collab they didn't open — it stays tracked under the
-- original creator, with this transfer record + an audit-log entry.
--
-- Safe to re-run (idempotent).

alter table public.deals add column if not exists assigned_to      text;
alter table public.deals add column if not exists transferred_from text;
alter table public.deals add column if not exists transferred_at   timestamptz;
alter table public.deals add column if not exists transferred_by   text;

notify pgrst, 'reload schema';
