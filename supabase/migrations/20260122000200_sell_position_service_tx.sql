-- Sell a user's position (cash out shares) using service_role.
-- Wrapper around sell_position_tx that injects request.jwt.claim.sub so auth.uid() resolves.

drop function if exists public.sell_position_service_tx(uuid, uuid, text, numeric);

create or replace function public.sell_position_service_tx(
  p_user_id uuid,
  p_market_id uuid,
  p_side text,
  p_shares numeric
) returns table (
  trade_id uuid,
  payout_net_minor bigint,
  new_balance_minor bigint,
  shares_sold numeric,
  price_before numeric,
  price_after numeric
) language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception 'INVALID_USER';
  end if;

  -- Ensure auth.uid() resolves inside sell_position_tx
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  return query
    select * from public.sell_position_tx(p_market_id, p_side, p_shares);
end;
$$;

revoke all on function public.sell_position_service_tx(uuid, uuid, text, numeric) from public;
grant execute on function public.sell_position_service_tx(uuid, uuid, text, numeric) to service_role;
