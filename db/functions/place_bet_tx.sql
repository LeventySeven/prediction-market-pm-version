-- Bounded cost helpers (keep function names for compatibility) -------------
create or replace function lmsr_cost_safe(q_yes numeric, q_no numeric, b numeric)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_s numeric;
  v_x numeric;
  v_abs numeric;
  v_softplus numeric;
  v_a constant numeric := 0.01;
  v_b constant numeric := 0.99;
  v_k constant numeric := 0.85;
begin
  if b is null or b <= 0 then
    return 0;
  end if;

  v_s := coalesce(q_yes, 0) - coalesce(q_no, 0);
  v_x := (v_k * v_s) / b;

  if v_x >= 60 then
    v_softplus := v_x;
  elsif v_x <= -60 then
    v_softplus := exp(v_x);
  else
    v_abs := abs(v_x);
    v_softplus := greatest(v_x, 0) + ln(1 + exp(-v_abs));
  end if;

  return v_a * v_s + (v_b - v_a) * (b / v_k) * v_softplus;
end;
$$;

-- On-chain settlement mirrors ------------------------------------------------
create or replace function place_bet_onchain_tx(
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

create or replace function sell_position_onchain_tx(
  p_market_id uuid,
  p_side text,
  p_shares numeric,
  p_payout_minor bigint,
  p_price_before numeric,
  p_price_after numeric,
  p_user_id uuid DEFAULT NULL
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
declare
  v_user_id uuid := coalesce(auth.uid(), p_user_id);
  v_market markets%rowtype;
  v_asset assets%rowtype;
  v_state market_amm_state%rowtype;
  v_position positions%rowtype;
  v_side_text text := upper(coalesce(p_side, ''));
  v_side outcome_side;
  v_trade_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_new_balance_minor bigint;
  v_remaining_shares numeric;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_side_text not in ('YES', 'NO') then
    raise exception 'INVALID_SIDE';
  end if;
  v_side := v_side_text::outcome_side;

  if p_shares is null or p_shares <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_payout_minor is null or p_payout_minor <= 0 then
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

  select * into v_position
  from positions
  where user_id = v_user_id
    and market_id = p_market_id
    and outcome = v_side
  for update;
  if not found or coalesce(v_position.shares, 0) <= 0 then
    raise exception 'NO_POSITION';
  end if;
  if v_position.shares < p_shares then
    raise exception 'INSUFFICIENT_SHARES';
  end if;

  select * into v_state from market_amm_state where market_id = p_market_id for update;
  if not found then
    raise exception 'AMM_STATE_MISSING';
  end if;
  v_state.q_yes := coalesce(v_state.q_yes, 0);
  v_state.q_no := coalesce(v_state.q_no, 0);

  if v_side = 'YES'::outcome_side then
    v_state.q_yes := v_state.q_yes - p_shares;
  else
    v_state.q_no := v_state.q_no - p_shares;
  end if;

  update market_amm_state
     set q_yes = v_state.q_yes,
         q_no = v_state.q_no,
         last_price_yes = p_price_after,
         updated_at = v_now
   where market_id = p_market_id;

  v_remaining_shares := v_position.shares - p_shares;
  if v_remaining_shares < 0 then
    v_remaining_shares := 0;
  end if;

  update positions
     set shares = v_remaining_shares,
         updated_at = v_now
   where user_id = v_user_id
     and market_id = p_market_id
     and outcome = v_side;

  insert into wallet_balances (user_id, asset_code, balance_minor, updated_at)
  values (v_user_id, v_asset.code, p_payout_minor, v_now)
  on conflict (user_id, asset_code)
  do update set
    balance_minor = wallet_balances.balance_minor + p_payout_minor,
    updated_at = v_now
  returning balance_minor into v_new_balance_minor;

  insert into wallet_transactions (id, user_id, asset_code, amount_minor, kind, market_id, trade_id, created_at)
  values (gen_random_uuid(), v_user_id, v_asset.code, p_payout_minor, 'trade', p_market_id, v_trade_id, v_now);

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
    'sell',
    v_side,
    v_asset.code,
    p_payout_minor,
    0,
    p_payout_minor,
    -p_shares,
    p_price_before,
    p_price_after,
    v_now
  );

  return query
    select
      v_trade_id,
      p_payout_minor,
      v_new_balance_minor,
      p_shares,
      p_price_before,
      p_price_after;
end;
$$;

create or replace function place_bet_onchain_service_tx(
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
    select * from place_bet_onchain_tx(
      p_market_id,
      p_side,
      p_collateral_minor,
      p_shares,
      p_price_before,
      p_price_after
    );
end;
$$;

create or replace function sell_position_onchain_service_tx(
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
    select * from sell_position_onchain_tx(
      p_market_id,
      p_side,
      p_shares,
      p_payout_minor,
      p_price_before,
      p_price_after
    );
end;
$$;

create or replace function claim_winnings_onchain_tx(
  p_market_id uuid,
  p_user_id uuid,
  p_payout_minor bigint
) returns table (
  new_balance_minor bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := coalesce(auth.uid(), p_user_id);
  v_market markets%rowtype;
  v_asset assets%rowtype;
  v_position positions%rowtype;
  v_now timestamptz := now();
  v_new_balance_minor bigint;
  v_outcome outcome_side;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_payout_minor is null or p_payout_minor <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into v_market from markets where id = p_market_id for update;
  if not found then
    raise exception 'MARKET_NOT_FOUND';
  end if;
  if v_market.resolve_outcome is null then
    raise exception 'MARKET_NOT_RESOLVED';
  end if;
  v_outcome := v_market.resolve_outcome;

  select * into v_asset from assets where code = coalesce(v_market.settlement_asset_code, 'VCOIN') for update;
  if not found or not v_asset.is_enabled then
    raise exception 'ASSET_DISABLED';
  end if;

  select * into v_position
  from positions
  where user_id = v_user_id
    and market_id = p_market_id
  for update;
  if not found then
    raise exception 'NO_POSITION';
  end if;

  if v_position.outcome <> v_outcome or coalesce(v_position.shares, 0) <= 0 then
    raise exception 'NO_POSITION';
  end if;

  update positions
     set shares = 0,
         updated_at = v_now
   where user_id = v_user_id
     and market_id = p_market_id
     and outcome = v_outcome;

  insert into wallet_balances (user_id, asset_code, balance_minor, updated_at)
  values (v_user_id, v_asset.code, p_payout_minor, v_now)
  on conflict (user_id, asset_code)
  do update set
    balance_minor = wallet_balances.balance_minor + p_payout_minor,
    updated_at = v_now
  returning balance_minor into v_new_balance_minor;

  insert into wallet_transactions (id, user_id, asset_code, amount_minor, kind, market_id, created_at)
  values (gen_random_uuid(), v_user_id, v_asset.code, p_payout_minor, 'payout', p_market_id, v_now);

  return query select v_new_balance_minor;
end;
$$;

create or replace function lmsr_price_yes_safe(q_yes numeric, q_no numeric, b numeric)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_s numeric;
  v_x numeric;
  v_sigmoid numeric;
  v_a constant numeric := 0.01;
  v_b constant numeric := 0.99;
  v_k constant numeric := 0.85;
begin
  if b is null or b <= 0 then
    return 0.5;
  end if;

  v_s := coalesce(q_yes, 0) - coalesce(q_no, 0);
  v_x := (v_k * v_s) / b;

  if v_x >= 60 then
    v_sigmoid := 1;
  elsif v_x <= -60 then
    v_sigmoid := 0;
  else
    v_sigmoid := 1 / (1 + exp(-v_x));
  end if;

  return v_a + (v_b - v_a) * v_sigmoid;
end;
$$;

-- Main transactional RPC ----------------------------------------------------
create or replace function place_bet_tx(
  p_market_id uuid,
  p_side text,
  p_amount numeric
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
  MAX_BET_MAJOR constant numeric := 10000; -- temporary MVP cap in human units (~10k VCOIN)
  v_user_id uuid := auth.uid();
  v_market markets%rowtype;
  v_asset assets%rowtype;
  v_balance wallet_balances%rowtype;
  v_side_text text := upper(coalesce(p_side, ''));
  v_side outcome_side;
  v_amount_minor numeric;
  v_fee_minor numeric;
  v_net_minor numeric;
  v_scale numeric;
  v_state market_amm_state%rowtype;
  v_decimals integer;
  v_price_before numeric;
  v_price_after numeric;
  v_cost_before numeric;
  v_target_cost numeric;
  v_shares_low numeric := 0;
  v_shares_high numeric;
  v_shares_mid numeric;
  v_cost_mid numeric;
  v_iterations int;
  v_shares numeric;
  v_trade_id uuid := gen_random_uuid();
  v_trade_price numeric;
  v_position positions%rowtype;
  v_existing_shares numeric;
  v_existing_avg_price numeric;
  v_total_shares numeric;
  v_avg_price numeric;
  v_now timestamptz := now();
  v_fee_bps numeric;
  v_amount_minor_big bigint;
  v_fee_minor_big bigint;
  v_net_minor_big bigint;
  v_new_balance_minor bigint;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if v_side_text not in ('YES', 'NO') then
    raise exception 'INVALID_SIDE';
  end if;

  v_side := v_side_text::outcome_side;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  if p_amount > MAX_BET_MAJOR then
    raise exception 'BET_TOO_LARGE';
  end if;

  select *
  into v_market
  from markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND';
  end if;

  if v_market.state <> 'open' then
    raise exception 'MARKET_NOT_OPEN';
  end if;

  if v_market.closes_at <= v_now then
    raise exception 'MARKET_CLOSED';
  end if;

  if v_market.resolve_outcome is not null then
    raise exception 'MARKET_RESOLVED';
  end if;

  select *
  into v_asset
  from assets
  where code = coalesce(v_market.settlement_asset_code, 'VCOIN')
  for update;

  if not found or not v_asset.is_enabled then
    raise exception 'ASSET_DISABLED';
  end if;

  v_decimals := greatest(0, least(coalesce(v_asset.decimals, 6), 6));
  v_scale := power(10::numeric, v_decimals::numeric);
  v_amount_minor := floor(p_amount * v_scale);

  if v_amount_minor <= 0 then
    raise exception 'AMOUNT_TOO_SMALL';
  end if;

  select *
  into v_balance
  from wallet_balances
  where user_id = v_user_id
    and asset_code = v_asset.code
  for update;

  if not found or v_balance.balance_minor < v_amount_minor then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  select *
  into v_state
  from market_amm_state
  where market_id = p_market_id
  for update;

  if not found then
    raise exception 'AMM_STATE_MISSING';
  end if;

  v_state.q_yes := coalesce(v_state.q_yes, 0);
  v_state.q_no := coalesce(v_state.q_no, 0);
  v_state.b := coalesce(v_state.b, v_market.liquidity_b);
  if v_state.b is null or v_state.b <= 0 then
    raise exception 'INVALID_LIQUIDITY';
  end if;

  v_fee_bps := coalesce(v_market.fee_bps, 0);
  v_fee_minor := floor(v_amount_minor * v_fee_bps / 10000);
  v_net_minor := v_amount_minor - v_fee_minor;
  if v_net_minor <= 0 then
    raise exception 'AMOUNT_TOO_SMALL';
  end if;

  v_price_before := lmsr_price_yes_safe(v_state.q_yes, v_state.q_no, v_state.b);
  v_cost_before := lmsr_cost_safe(v_state.q_yes, v_state.q_no, v_state.b);
  v_target_cost := v_net_minor / v_scale;

  if v_target_cost <= 0 then
    raise exception 'AMOUNT_TOO_SMALL';
  end if;

  v_shares_high := greatest(v_target_cost, 0.000001);

  loop
    v_cost_mid := lmsr_cost_safe(
      v_state.q_yes + case when v_side = 'YES'::outcome_side then v_shares_high else 0 end,
      v_state.q_no + case when v_side = 'NO'::outcome_side then v_shares_high else 0 end,
      v_state.b
    ) - v_cost_before;
    exit when v_cost_mid >= v_target_cost;
    v_shares_high := v_shares_high * 2;
  end loop;

  for v_iterations in 1..60 loop
    v_shares_mid := (v_shares_low + v_shares_high) / 2;
    v_cost_mid := lmsr_cost_safe(
      v_state.q_yes + case when v_side = 'YES'::outcome_side then v_shares_mid else 0 end,
      v_state.q_no + case when v_side = 'NO'::outcome_side then v_shares_mid else 0 end,
      v_state.b
    ) - v_cost_before;

    if abs(v_cost_mid - v_target_cost) <= 1e-9 then
      exit;
    end if;

    if v_cost_mid < v_target_cost then
      v_shares_low := v_shares_mid;
    else
      v_shares_high := v_shares_mid;
    end if;
  end loop;

  v_shares := v_shares_high;
  if v_shares <= 0 then
    raise exception 'AMOUNT_TOO_SMALL';
  end if;

  if v_side = 'YES'::outcome_side then
    v_state.q_yes := v_state.q_yes + v_shares;
  else
    v_state.q_no := v_state.q_no + v_shares;
  end if;

  v_price_after := lmsr_price_yes_safe(v_state.q_yes, v_state.q_no, v_state.b);

  v_amount_minor_big := v_amount_minor::bigint;
  v_fee_minor_big := v_fee_minor::bigint;
  v_net_minor_big := v_net_minor::bigint;

  update market_amm_state
     set q_yes = v_state.q_yes,
         q_no = v_state.q_no,
         last_price_yes = v_price_after,
         fee_accumulated_minor = fee_accumulated_minor + v_fee_minor_big,
         updated_at = v_now
   where market_id = p_market_id;

  update wallet_balances
     set balance_minor = balance_minor - v_amount_minor_big,
         updated_at = v_now
   where user_id = v_user_id
     and asset_code = v_asset.code
   returning balance_minor into v_new_balance_minor;

  insert into wallet_transactions (id, user_id, asset_code, amount_minor, kind, market_id, trade_id, created_at)
  values (gen_random_uuid(), v_user_id, v_asset.code, -v_net_minor_big, 'trade', p_market_id, v_trade_id, v_now);

  if v_fee_minor_big > 0 then
    insert into wallet_transactions (id, user_id, asset_code, amount_minor, kind, market_id, trade_id, created_at)
    values (gen_random_uuid(), v_user_id, v_asset.code, -v_fee_minor_big, 'fee', p_market_id, v_trade_id, v_now);
  end if;

  select *
  into v_position
  from positions
  where user_id = v_user_id
    and market_id = p_market_id
    and outcome = v_side
  for update;

  v_existing_shares := coalesce(v_position.shares, 0);
  v_existing_avg_price := coalesce(v_position.avg_entry_price, v_price_before);
  v_total_shares := v_existing_shares + v_shares;
  v_trade_price := (v_net_minor / v_scale) / v_shares;

  if v_total_shares > 0 then
    v_avg_price := ((v_existing_shares * v_existing_avg_price) + (v_shares * v_trade_price)) / v_total_shares;
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
    v_amount_minor_big,
    v_fee_minor_big,
    -v_net_minor_big,
    v_shares,
    v_price_before,
    v_price_after,
    v_now
  );

  return query
    select
      v_trade_id,
      v_new_balance_minor,
      v_shares,
      v_price_before,
      v_price_after;
end;
$$;

create or replace function sell_position_tx(
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
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  MAX_SHARE_AMOUNT constant numeric := 1e9;
  MIN_SHARE_STEP constant numeric := 1e-9;
  SHARE_EPS constant numeric := 1e-9;
  v_user_id uuid := auth.uid();
  v_market markets%rowtype;
  v_asset assets%rowtype;
  v_state market_amm_state%rowtype;
  v_position positions%rowtype;
  v_side_text text := upper(coalesce(p_side, ''));
  v_side outcome_side;
  v_shares numeric := coalesce(p_shares, 0);
  v_decimals integer;
  v_scale numeric;
  v_fee_bps numeric;
  v_now timestamptz := now();
  v_price_before numeric;
  v_price_after numeric;
  v_cost_before numeric;
  v_cost_after numeric;
  v_q_yes_before numeric;
  v_q_no_before numeric;
  v_q_yes_after numeric;
  v_q_no_after numeric;
  v_gross_minor numeric;
  v_fee_minor numeric;
  v_net_minor numeric;
  v_trade_id uuid := gen_random_uuid();
  v_new_balance_minor bigint;
  v_gross_minor_big bigint;
  v_fee_minor_big bigint;
  v_net_minor_big bigint;
  v_remaining_shares numeric;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if v_side_text not in ('YES', 'NO') then
    raise exception 'INVALID_SIDE';
  end if;

  v_side := v_side_text::outcome_side;

  if v_shares <= 0 or v_shares < MIN_SHARE_STEP then
    raise exception 'AMOUNT_TOO_SMALL';
  end if;

  if v_shares > MAX_SHARE_AMOUNT then
    raise exception 'SHARES_TOO_LARGE';
  end if;

  select *
  into v_market
  from markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND';
  end if;

  if v_market.state <> 'open' then
    raise exception 'MARKET_NOT_OPEN';
  end if;

  if v_market.closes_at <= v_now then
    raise exception 'MARKET_CLOSED';
  end if;

  if v_market.resolve_outcome is not null then
    raise exception 'MARKET_RESOLVED';
  end if;

  select *
  into v_asset
  from assets
  where code = coalesce(v_market.settlement_asset_code, 'VCOIN')
  for update;

  if not found or not v_asset.is_enabled then
    raise exception 'ASSET_DISABLED';
  end if;

  v_decimals := greatest(0, least(coalesce(v_asset.decimals, 6), 18));
  v_scale := power(10::numeric, v_decimals::numeric);

  v_fee_bps := coalesce(v_market.fee_bps, 0);

  select *
  into v_position
  from positions
  where user_id = v_user_id
    and market_id = p_market_id
    and outcome = v_side
  for update;

  if not found or coalesce(v_position.shares, 0) <= 0 then
    raise exception 'NO_POSITION';
  end if;

  if v_position.shares + SHARE_EPS < v_shares then
    raise exception 'INSUFFICIENT_SHARES';
  end if;

  if v_shares > v_position.shares then
    v_shares := v_position.shares;
  end if;

  select *
  into v_state
  from market_amm_state
  where market_id = p_market_id
  for update;

  if not found then
    raise exception 'AMM_STATE_MISSING';
  end if;

  v_state.q_yes := coalesce(v_state.q_yes, 0);
  v_state.q_no := coalesce(v_state.q_no, 0);
  v_state.b := coalesce(v_state.b, v_market.liquidity_b);

  if v_state.b is null or v_state.b <= 0 then
    raise exception 'INVALID_LIQUIDITY';
  end if;

  v_q_yes_before := v_state.q_yes;
  v_q_no_before := v_state.q_no;

  v_price_before := lmsr_price_yes_safe(v_q_yes_before, v_q_no_before, v_state.b);
  v_cost_before := lmsr_cost_safe(v_q_yes_before, v_q_no_before, v_state.b);

  if v_side = 'YES'::outcome_side then
    if v_q_yes_before + SHARE_EPS < v_shares then
      raise exception 'AMM_INCONSISTENT';
    end if;
    v_q_yes_after := v_q_yes_before - v_shares;
    v_q_no_after := v_q_no_before;
  else
    if v_q_no_before + SHARE_EPS < v_shares then
      raise exception 'AMM_INCONSISTENT';
    end if;
    v_q_yes_after := v_q_yes_before;
    v_q_no_after := v_q_no_before - v_shares;
  end if;

  if v_q_yes_after < 0 or v_q_no_after < 0 then
    raise exception 'AMM_INCONSISTENT';
  end if;

  v_cost_after := lmsr_cost_safe(v_q_yes_after, v_q_no_after, v_state.b);

  if v_cost_before <= v_cost_after then
    raise exception 'AMOUNT_TOO_SMALL';
  end if;

  v_price_after := lmsr_price_yes_safe(v_q_yes_after, v_q_no_after, v_state.b);

  v_gross_minor := floor((v_cost_before - v_cost_after) * v_scale);

  if v_gross_minor <= 0 then
    raise exception 'AMOUNT_TOO_SMALL';
  end if;

  v_fee_minor := floor(v_gross_minor * v_fee_bps / 10000);
  v_net_minor := v_gross_minor - v_fee_minor;

  if v_net_minor <= 0 then
    raise exception 'AMOUNT_TOO_SMALL';
  end if;

  v_gross_minor_big := v_gross_minor::bigint;
  v_fee_minor_big := v_fee_minor::bigint;
  v_net_minor_big := v_net_minor::bigint;

  update market_amm_state
     set q_yes = v_q_yes_after,
         q_no = v_q_no_after,
         last_price_yes = v_price_after,
         fee_accumulated_minor = fee_accumulated_minor + v_fee_minor_big,
         updated_at = v_now
   where market_id = p_market_id;

  v_remaining_shares := v_position.shares - v_shares;
  if v_remaining_shares < SHARE_EPS then
    v_remaining_shares := 0;
  end if;

  update positions
     set shares = v_remaining_shares,
         updated_at = v_now
   where user_id = v_user_id
     and market_id = p_market_id
     and outcome = v_side;

  update wallet_balances
     set balance_minor = balance_minor + v_net_minor_big,
         updated_at = v_now
   where user_id = v_user_id
     and asset_code = v_asset.code
   returning balance_minor into v_new_balance_minor;

  insert into wallet_transactions (id, user_id, asset_code, amount_minor, kind, market_id, trade_id, created_at)
  values (gen_random_uuid(), v_user_id, v_asset.code, v_net_minor_big, 'trade', p_market_id, v_trade_id, v_now);

  if v_fee_minor_big > 0 then
    insert into wallet_transactions (id, user_id, asset_code, amount_minor, kind, market_id, trade_id, created_at)
    values (gen_random_uuid(), v_user_id, v_asset.code, -v_fee_minor_big, 'fee', p_market_id, v_trade_id, v_now);
  end if;

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
    'sell',
    v_side,
    v_asset.code,
    v_gross_minor_big,
    v_fee_minor_big,
    v_net_minor_big,
    -v_shares,
    v_price_before,
    v_price_after,
    v_now
  );

  return query
    select
      v_trade_id,
      v_net_minor_big,
      v_new_balance_minor,
      v_shares,
      v_price_before,
      v_price_after;
end;
$$;