-- 031_campaign_enabled_months.sql
-- Campaigns can now be turned ON/OFF for new deals, and scoped to specific month(s).
--   enabled        — when false, the campaign is hidden from the deal-creation dropdown
--                    (negotiators only pick from active campaigns). Still visible in lists/analytics.
--   active_months  — optional list of "YYYY-MM" strings the campaign is intended for (label/reporting).
--
-- Safe to re-run (idempotent).

alter table public.campaigns add column if not exists enabled       boolean not null default true;
alter table public.campaigns add column if not exists active_months jsonb   not null default '[]'::jsonb;

notify pgrst, 'reload schema';
