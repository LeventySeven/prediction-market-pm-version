-- Service-role wrappers for on-chain finalize RPCs.
-- Keeps finalize paths stable across DB function signature changes while preserving auth.uid() behavior.

drop function if exists public.place_bet_onchain_service_tx(uuid, uuid, text, bigint, numeric, numeric, numeric);
create or replace function public.place_bet_onchain_service_tx(
  p_user_id uuid,
  p_market_id uuid,
  p_side text,
  p_collateral_minor bigint,
  p_shares numeric,
  p_price_before numeric,
  p_price_after numeric
) returns table (
  trade_id uuid,
  new_balance_minor bigint,
  shares_bought numeric,
  price_before numeric,
  price_after numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception 'INVALID_USER';
  end if;

  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  return query
    select * from public.place_bet_onchain_tx(
      p_market_id,
      p_side,
      p_collateral_minor,
      p_shares,
      p_price_before,
      p_price_after
    );
end;
$$;

drop function if exists public.sell_position_onchain_service_tx(uuid, uuid, text, numeric, bigint, numeric, numeric);
create or replace function public.sell_position_onchain_service_tx(
  p_user_id uuid,
  p_market_id uuid,
  p_side text,
  p_shares numeric,
  p_payout_minor bigint,
  p_price_before numeric,
  p_price_after numeric
) returns table (
  trade_id uuid,
  payout_net_minor bigint,
  new_balance_minor bigint,
  shares_sold numeric,
  price_before numeric,
  price_after numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception 'INVALID_USER';
  end if;

  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  return query
    select * from public.sell_position_onchain_tx(
      p_market_id,
      p_side,
      p_shares,
      p_payout_minor,
      p_price_before,
      p_price_after
    );
end;
$$;

revoke all on function public.place_bet_onchain_service_tx(uuid, uuid, text, bigint, numeric, numeric, numeric) from public;
grant execute on function public.place_bet_onchain_service_tx(uuid, uuid, text, bigint, numeric, numeric, numeric) to service_role;

revoke all on function public.sell_position_onchain_service_tx(uuid, uuid, text, numeric, bigint, numeric, numeric) from public;
grant execute on function public.sell_position_onchain_service_tx(uuid, uuid, text, numeric, bigint, numeric, numeric) to service_role;
