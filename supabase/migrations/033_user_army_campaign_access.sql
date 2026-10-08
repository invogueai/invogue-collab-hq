-- 033_user_army_campaign_access.sql
-- Per-user permission: lets a non-manager user (e.g. a negotiator) create
-- Creator Army campaigns only. Managers/Finance/Admin can always create any campaign.
-- Toggle this from Team & Users.
--
-- Safe to re-run (idempotent).

alter table public.users add column if not exists can_create_army_campaigns boolean not null default false;

notify pgrst, 'reload schema';
