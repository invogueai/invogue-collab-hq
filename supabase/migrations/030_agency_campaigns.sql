-- 030_agency_campaigns.sql
-- Agency-managed campaigns: campaigns run through an external agency.
-- For these, each collab SKIPS the per-creator confirmation email + acknowledgement
-- and SKIPS the per-creator payment flow entirely. Payment is a single lump sum
-- due to the agency at the end of the campaign, tracked at the campaign level here.
--
-- `agency` is mutually exclusive with `army` (enforced in app logic).
-- Safe to re-run (idempotent).

alter table public.campaigns add column if not exists agency        boolean not null default false;
alter table public.campaigns add column if not exists agency_name   text;
alter table public.campaigns add column if not exists agency_payout  numeric not null default 0;
alter table public.campaigns add column if not exists agency_paid    boolean not null default false;
alter table public.campaigns add column if not exists agency_paid_at timestamptz;
alter table public.campaigns add column if not exists agency_paid_by text;

notify pgrst, 'reload schema';
