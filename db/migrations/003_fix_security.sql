-- Recreate trades_public view without SECURITY DEFINER and lock down permissions.
begin;

drop view if exists public.trades_public;

create or replace view public.trades_public as
select
  id,
  market_id,
  action,
  outcome,
  asset_code,
  collateral_gross_minor,
  fee_minor,
  collateral_net_minor,
  shares_delta,
  price_before,
  price_after,
  created_at
from public.trades;

-- Remove implicit PUBLIC grants and grant read-only access explicitly.
revoke all on public.trades_public from public;

-- Replace the role list below with the roles that should read the public trade feed.
-- For Supabase defaults this is typically anon + authenticated.
grant select on public.trades_public to anon;
grant select on public.trades_public to authenticated;

commit;

