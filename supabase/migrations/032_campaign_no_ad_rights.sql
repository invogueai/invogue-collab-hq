-- 032_campaign_no_ad_rights.sql
-- Agency (and other) campaigns can be marked as granting NO ad rights:
-- the brand can't run the creators' content as paid ads. Collabs under such a
-- campaign get no usage window and never enter the ad / Creative Hub pipeline.
--
-- Safe to re-run (idempotent).

alter table public.campaigns add column if not exists no_ad_rights boolean not null default false;

notify pgrst, 'reload schema';
