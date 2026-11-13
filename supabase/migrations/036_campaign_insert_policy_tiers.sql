-- 036_campaign_insert_policy_tiers.sql
-- The old campaigns INSERT policy only allowed admin/approver, so users granted
-- per-user campaign access (can_create_regular_campaigns / can_create_army_campaigns)
-- were blocked at the DB with "new row violates row-level security policy".
-- Replace it with a tier-aware policy matching the app:
--   manager (admin/approver/finance) -> any type incl. agency
--   regular flag                     -> regular + army
--   army flag                        -> army only
--
-- Safe to re-run (idempotent).

create or replace function public.my_campaign_access() returns text
  language sql stable security definer set search_path to 'public' as $$
  select case
    when u.role in ('admin','approver','finance') then 'manager'
    when coalesce(u.can_create_regular_campaigns,false) then 'regular'
    when coalesce(u.can_create_army_campaigns,false) then 'army'
    else 'none'
  end
  from public.users u
  where lower(u.email) = lower(auth.jwt()->>'email')
  limit 1;
$$;

drop policy if exists "Admin/approver manage campaigns" on public.campaigns;

create policy "Create campaigns by tier" on public.campaigns
  for insert with check (
    case
      when agency then coalesce(public.my_campaign_access(),'none') = 'manager'
      when army   then coalesce(public.my_campaign_access(),'none') in ('manager','regular','army')
      else             coalesce(public.my_campaign_access(),'none') in ('manager','regular')
    end
  );

notify pgrst, 'reload schema';
