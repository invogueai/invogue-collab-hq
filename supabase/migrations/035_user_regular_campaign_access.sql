-- 035_user_regular_campaign_access.sql
-- Per-user permission to create REGULAR campaigns (also implies Creator Army).
-- Agency campaigns remain restricted to Manager/Finance/Admin.
-- Tiers: can_create_regular_campaigns (regular + army) > can_create_army_campaigns (army only).
--
-- Safe to re-run (idempotent).

alter table public.users add column if not exists can_create_regular_campaigns boolean not null default false;

notify pgrst, 'reload schema';
