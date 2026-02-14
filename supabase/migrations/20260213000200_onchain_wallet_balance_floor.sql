-- Ensure USDC on-chain mirror finalization never violates wallet_balance_nonneg.
-- For non-custodial assets, wallet_balances is informational and must not block trade mirroring.

create or replace function public.place_bet_onchain_tx(
  p_market_id uuid,
  p_side text,
  p_collateral_minor bigint,
  p_shares numeric,
  p_price_before numeric,
  p_price_after numeric,
  p_user_id uuid DEFAULT NULL
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
declare
  v_user_id uuid := coalesce(auth.uid(), p_user_id);
  v_market markets%rowtype;
  v_asset assets%rowtype;
  v_side_text text := upper(coalesce(p_side, ''));
  v_side outcome_side;
  v_state market_amm_state%rowtype;
  v_trade_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_decimals integer;
  v_scale numeric;
  v_new_balance_minor bigint;
  v_trade_price numeric;
  v_position positions%rowtype;
  v_existing_shares numeric;
  v_existing_avg_price numeric;
  v_total_shares numeric;
  v_avg_price numeric;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if v_side_text not in ('YES', 'NO') then
    raise exception 'INVALID_SIDE';
  end if;
  v_side := v_side_text::outcome_side;

  if p_collateral_minor is null or p_collateral_minor <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_shares is null or p_shares <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into v_market from markets where id = p_market_id for update;
  if not found then
    raise exception 'MARKET_NOT_FOUND';
  end if;
  if v_market.state <> 'open' then
    raise exception 'MARKET_NOT_OPEN';
  end if;
  if v_market.resolve_outcome is not null then
    raise exception 'MARKET_RESOLVED';
  end if;

  select * into v_asset from assets where code = coalesce(v_market.settlement_asset_code, 'VCOIN') for update;
  if not found or not v_asset.is_enabled then
    raise exception 'ASSET_DISABLED';
  end if;

  select * into v_state from market_amm_state where market_id = p_market_id for update;
  if not found then
    raise exception 'AMM_STATE_MISSING';
  end if;

  v_state.q_yes := coalesce(v_state.q_yes, 0);
  v_state.q_no := coalesce(v_state.q_no, 0);

  if v_side = 'YES'::outcome_side then
    v_state.q_yes := v_state.q_yes + p_shares;
  else
    v_state.q_no := v_state.q_no + p_shares;
  end if;

  update market_amm_state
     set q_yes = v_state.q_yes,
         q_no = v_state.q_no,
         last_price_yes = p_price_after,
         updated_at = v_now
   where market_id = p_market_id;

  insert into wallet_balances (user_id, asset_code, balance_minor, updated_at)
  values (v_user_id, v_asset.code, 0, v_now)
  on conflict (user_id, asset_code)
  do update set
    balance_minor = greatest(wallet_balances.balance_minor - p_collateral_minor, 0),
    updated_at = v_now
  returning balance_minor into v_new_balance_minor;

  insert into wallet_transactions (id, user_id, asset_code, amount_minor, kind, market_id, trade_id, created_at)
  values (gen_random_uuid(), v_user_id, v_asset.code, -p_collateral_minor, 'trade', p_market_id, v_trade_id, v_now);

  v_decimals := greatest(0, least(coalesce(v_asset.decimals, 6), 6));
  v_scale := power(10::numeric, v_decimals::numeric);
  v_trade_price := (p_collateral_minor / v_scale) / p_shares;

  select * into v_position
  from positions
  where user_id = v_user_id
    and market_id = p_market_id
    and outcome = v_side
  for update;

  v_existing_shares := coalesce(v_position.shares, 0);
  v_existing_avg_price := coalesce(v_position.avg_entry_price, p_price_before);
  v_total_shares := v_existing_shares + p_shares;

  if v_total_shares > 0 then
    v_avg_price := ((v_existing_shares * v_existing_avg_price) + (p_shares * v_trade_price)) / v_total_shares;
  else
    v_avg_price := v_trade_price;
  end if;

  insert into positions (user_id, market_id, outcome, shares, avg_entry_price, updated_at)
  values (v_user_id, p_market_id, v_side, v_total_shares, v_avg_price, v_now)
  on conflict (user_id, market_id, outcome)
  do update set
    shares = excluded.shares,
    avg_entry_price = excluded.avg_entry_price,
    updated_at = excluded.updated_at;

  insert into trades (
    id,
    market_id,
    user_id,
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
  )
  values (
    v_trade_id,
    p_market_id,
    v_user_id,
    'buy',
    v_side,
    v_asset.code,
    p_collateral_minor,
    0,
    -p_collateral_minor,
    p_shares,
    p_price_before,
    p_price_after,
    v_now
  );

  return query
    select
      v_trade_id,
      v_new_balance_minor,
      p_shares,
      p_price_before,
      p_price_after;
end;
$$;
