begin;

-- -----------------------------------------------------------------------------
-- 1) Additive schema changes (backward-compatible for legacy YES/NO markets)
-- -----------------------------------------------------------------------------

alter table public.markets
  add column if not exists market_type text not null default 'binary',
  add column if not exists resolved_outcome_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'markets_market_type_chk'
      and conrelid = 'public.markets'::regclass
  ) then
    alter table public.markets
      add constraint markets_market_type_chk
      check (market_type in ('binary', 'multi_choice'));
  end if;
end $$;

create table if not exists public.market_outcomes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  slug text not null,
  title text not null,
  icon_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market_id, slug)
);

create index if not exists market_outcomes_market_sort_idx
  on public.market_outcomes (market_id, sort_order, id);

create table if not exists public.market_outcome_amm_state (
  market_id uuid not null references public.markets(id) on delete cascade,
  outcome_id uuid not null references public.market_outcomes(id) on delete cascade,
  q numeric not null default 0,
  last_price numeric not null default 0.5,
  updated_at timestamptz not null default now(),
  primary key (market_id, outcome_id)
);

create index if not exists market_outcome_amm_state_market_idx
  on public.market_outcome_amm_state (market_id);

alter table public.markets
  drop constraint if exists markets_resolved_outcome_id_fkey;
alter table public.markets
  add constraint markets_resolved_outcome_id_fkey
  foreign key (resolved_outcome_id)
  references public.market_outcomes(id)
  on delete set null;

alter table public.positions
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists outcome_id uuid;

update public.positions
set id = gen_random_uuid()
where id is null;

alter table public.positions
  alter column id set not null;

alter table public.positions
  drop constraint if exists positions_pkey;
alter table public.positions
  add constraint positions_pkey primary key (id);

alter table public.positions
  alter column outcome drop not null;

alter table public.positions
  drop constraint if exists positions_outcome_id_fkey;
alter table public.positions
  add constraint positions_outcome_id_fkey
  foreign key (outcome_id)
  references public.market_outcomes(id)
  on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'positions_user_market_outcome_unique'
      and conrelid = 'public.positions'::regclass
  ) then
    alter table public.positions
      add constraint positions_user_market_outcome_unique
      unique (user_id, market_id, outcome);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'positions_user_market_outcome_id_unique'
      and conrelid = 'public.positions'::regclass
  ) then
    alter table public.positions
      add constraint positions_user_market_outcome_id_unique
      unique (user_id, market_id, outcome_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'positions_outcome_xor_outcome_id_chk'
      and conrelid = 'public.positions'::regclass
  ) then
    alter table public.positions
      add constraint positions_outcome_xor_outcome_id_chk
      check (
        (outcome is not null and outcome_id is null)
        or
        (outcome is null and outcome_id is not null)
      );
  end if;
end $$;

create index if not exists positions_market_outcome_id_idx
  on public.positions (market_id, outcome_id);

alter table public.trades
  add column if not exists outcome_id uuid;

alter table public.trades
  alter column outcome drop not null;

alter table public.trades
  drop constraint if exists trades_outcome_id_fkey;
alter table public.trades
  add constraint trades_outcome_id_fkey
  foreign key (outcome_id)
  references public.market_outcomes(id)
  on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'trades_outcome_xor_outcome_id_chk'
      and conrelid = 'public.trades'::regclass
  ) then
    alter table public.trades
      add constraint trades_outcome_xor_outcome_id_chk
      check (
        (outcome is not null and outcome_id is null)
        or
        (outcome is null and outcome_id is not null)
      );
  end if;
end $$;

create index if not exists trades_market_outcome_id_idx
  on public.trades (market_id, outcome_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 2) Multi-outcome LMSR helpers (softmax probabilities, price = probability)
-- -----------------------------------------------------------------------------

create or replace function public.lmsr_multi_cost_for_market(
  p_market_id uuid,
  p_b numeric
) returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  with s as (
    select max((0.85 * q) / p_b) as m
    from public.market_outcome_amm_state
    where market_id = p_market_id
  )
  select
    case
      when p_b is null or p_b <= 0 then 0
      else (p_b / 0.85) * (
        coalesce((select m from s), 0) +
        ln(
          greatest(
            (select sum(exp(((0.85 * q) / p_b) - coalesce((select m from s), 0)))
             from public.market_outcome_amm_state
             where market_id = p_market_id),
            1e-30
          )
        )
      )
    end
$$;

create or replace function public.lmsr_multi_cost_for_market_with_delta(
  p_market_id uuid,
  p_outcome_id uuid,
  p_delta_shares numeric,
  p_b numeric
) returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  with v as (
    select
      outcome_id,
      (q + case when outcome_id = p_outcome_id then p_delta_shares else 0 end) as q_adj
    from public.market_outcome_amm_state
    where market_id = p_market_id
  ),
  s as (
    select max((0.85 * q_adj) / p_b) as m
    from v
  )
  select
    case
      when p_b is null or p_b <= 0 then 0
      else (p_b / 0.85) * (
        coalesce((select m from s), 0) +
        ln(
          greatest(
            (select sum(exp(((0.85 * q_adj) / p_b) - coalesce((select m from s), 0))) from v),
            1e-30
          )
        )
      )
    end
$$;

create or replace function public.lmsr_multi_prob_for_market_outcome(
  p_market_id uuid,
  p_outcome_id uuid,
  p_b numeric
) returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  with s as (
    select max((0.85 * q) / p_b) as m
    from public.market_outcome_amm_state
    where market_id = p_market_id
  ),
  e as (
    select
      outcome_id,
      exp(((0.85 * q) / p_b) - coalesce((select m from s), 0)) as w
    from public.market_outcome_amm_state
    where market_id = p_market_id
  )
  select
    coalesce(
      (select w from e where outcome_id = p_outcome_id) /
      greatest((select sum(w) from e), 1e-30),
      0
    )
$$;

create or replace function public.refresh_market_outcome_prices(
  p_market_id uuid,
  p_b numeric
) returns void
language sql
set search_path = public, pg_temp
as $$
  with s as (
    select max((0.85 * q) / p_b) as m
    from public.market_outcome_amm_state
    where market_id = p_market_id
  ),
  w as (
    select
      outcome_id,
      exp(((0.85 * q) / p_b) - coalesce((select m from s), 0)) as v
    from public.market_outcome_amm_state
    where market_id = p_market_id
  ),
  d as (
    select greatest(sum(v), 1e-30) as sum_v from w
  )
  update public.market_outcome_amm_state a
  set
    last_price = (select w.v / d.sum_v from w, d where w.outcome_id = a.outcome_id),
    updated_at = now()
  where a.market_id = p_market_id
$$;

-- -----------------------------------------------------------------------------
-- 3) Multi-outcome transactional RPCs (off-chain / VCOIN path)
-- -----------------------------------------------------------------------------

drop function if exists public.place_bet_multi_tx(uuid, uuid, numeric);
create or replace function public.place_bet_multi_tx(
  p_market_id uuid,
  p_outcome_id uuid,
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
  MAX_BET_MAJOR constant numeric := 10000;
  v_user_id uuid := auth.uid();
  v_market public.markets%rowtype;
  v_asset public.assets%rowtype;
  v_balance public.wallet_balances%rowtype;
  v_amount_minor numeric;
  v_fee_minor numeric;
  v_net_minor numeric;
  v_scale numeric;
  v_decimals integer;
  v_b numeric;
  v_cost_before numeric;
  v_target_cost numeric;
  v_cost_mid numeric;
  v_shares_low numeric := 0;
  v_shares_high numeric;
  v_shares_mid numeric;
  v_shares numeric;
  v_trade_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_new_balance_minor bigint;
  v_existing_shares numeric;
  v_existing_avg_price numeric;
  v_total_shares numeric;
  v_avg_price numeric;
  v_trade_price numeric;
  v_position public.positions%rowtype;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_amount > MAX_BET_MAJOR then
    raise exception 'BET_TOO_LARGE';
  end if;

  select * into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND';
  end if;
  if coalesce(v_market.market_type, 'binary') <> 'multi_choice' then
    raise exception 'MARKET_NOT_MULTI';
  end if;
  if v_market.state <> 'open' then
    raise exception 'MARKET_NOT_OPEN';
  end if;
  if v_market.closes_at <= v_now then
    raise exception 'MARKET_CLOSED';
  end if;
  if v_market.resolved_outcome_id is not null then
    raise exception 'MARKET_RESOLVED';
  end if;

  perform 1
  from public.market_outcomes mo
  where mo.id = p_outcome_id
    and mo.market_id = p_market_id
    and mo.is_active = true
  for update;
  if not found then
    raise exception 'OUTCOME_NOT_FOUND';
  end if;

  select * into v_asset
  from public.assets
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

  select * into v_balance
  from public.wallet_balances
  where user_id = v_user_id
    and asset_code = v_asset.code
  for update;
  if not found or v_balance.balance_minor < v_amount_minor then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  v_b := coalesce(v_market.liquidity_b, 0);
  if v_b <= 0 then
    raise exception 'INVALID_LIQUIDITY';
  end if;

  -- lock outcome state rows
  perform 1
  from public.market_outcome_amm_state
  where market_id = p_market_id
  for update;

  v_fee_minor := floor(v_amount_minor * coalesce(v_market.fee_bps, 0) / 10000);
  v_net_minor := v_amount_minor - v_fee_minor;
  if v_net_minor <= 0 then
    raise exception 'AMOUNT_TOO_SMALL';
  end if;

  v_cost_before := public.lmsr_multi_cost_for_market(p_market_id, v_b);
  v_target_cost := v_net_minor / v_scale;
  if v_target_cost <= 0 then
    raise exception 'AMOUNT_TOO_SMALL';
  end if;

  v_shares_high := greatest(v_target_cost, 0.000001);
  loop
    v_cost_mid := public.lmsr_multi_cost_for_market_with_delta(
      p_market_id,
      p_outcome_id,
      v_shares_high,
      v_b
    ) - v_cost_before;
    exit when v_cost_mid >= v_target_cost;
    v_shares_high := v_shares_high * 2;
  end loop;

  for _i in 1..60 loop
    v_shares_mid := (v_shares_low + v_shares_high) / 2;
    v_cost_mid := public.lmsr_multi_cost_for_market_with_delta(
      p_market_id,
      p_outcome_id,
      v_shares_mid,
      v_b
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

  -- prices before/after for selected outcome
  price_before := public.lmsr_multi_prob_for_market_outcome(p_market_id, p_outcome_id, v_b);

  update public.market_outcome_amm_state
  set q = q + v_shares,
      updated_at = v_now
  where market_id = p_market_id
    and outcome_id = p_outcome_id;

  perform public.refresh_market_outcome_prices(p_market_id, v_b);

  price_after := public.lmsr_multi_prob_for_market_outcome(p_market_id, p_outcome_id, v_b);

  update public.wallet_balances
  set balance_minor = balance_minor - v_amount_minor::bigint,
      updated_at = v_now
  where user_id = v_user_id
    and asset_code = v_asset.code
  returning balance_minor into v_new_balance_minor;

  insert into public.wallet_transactions (id, user_id, asset_code, amount_minor, kind, market_id, trade_id, created_at)
  values (gen_random_uuid(), v_user_id, v_asset.code, -v_net_minor::bigint, 'trade', p_market_id, v_trade_id, v_now);

  if v_fee_minor::bigint > 0 then
    insert into public.wallet_transactions (id, user_id, asset_code, amount_minor, kind, market_id, trade_id, created_at)
    values (gen_random_uuid(), v_user_id, v_asset.code, -v_fee_minor::bigint, 'fee', p_market_id, v_trade_id, v_now);
  end if;

  select * into v_position
  from public.positions
  where user_id = v_user_id
    and market_id = p_market_id
    and outcome_id = p_outcome_id
  for update;

  v_existing_shares := coalesce(v_position.shares, 0);
  v_existing_avg_price := coalesce(v_position.avg_entry_price, price_before);
  v_total_shares := v_existing_shares + v_shares;
  v_trade_price := (v_net_minor / v_scale) / v_shares;
  if v_total_shares > 0 then
    v_avg_price := ((v_existing_shares * v_existing_avg_price) + (v_shares * v_trade_price)) / v_total_shares;
  else
    v_avg_price := v_trade_price;
  end if;

  insert into public.positions (id, user_id, market_id, outcome, outcome_id, shares, avg_entry_price, updated_at)
  values (gen_random_uuid(), v_user_id, p_market_id, null, p_outcome_id, v_total_shares, v_avg_price, v_now)
  on conflict (user_id, market_id, outcome_id)
  do update set
    shares = excluded.shares,
    avg_entry_price = excluded.avg_entry_price,
    updated_at = excluded.updated_at;

  insert into public.trades (
    id,
    market_id,
    user_id,
    action,
    outcome,
    outcome_id,
    asset_code,
    collateral_gross_minor,
    fee_minor,
    collateral_net_minor,
    shares_delta,
    price_before,
    price_after,
    created_at
  ) values (
    v_trade_id,
    p_market_id,
    v_user_id,
    'buy',
    null,
    p_outcome_id,
    v_asset.code,
    v_amount_minor::bigint,
    v_fee_minor::bigint,
    -v_net_minor::bigint,
    v_shares,
    price_before,
    price_after,
    v_now
  );

  trade_id := v_trade_id;
  new_balance_minor := v_new_balance_minor;
  shares_bought := v_shares;
  return next;
end;
$$;

drop function if exists public.sell_position_multi_tx(uuid, uuid, numeric);
create or replace function public.sell_position_multi_tx(
  p_market_id uuid,
  p_outcome_id uuid,
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
  MIN_SHARE_STEP constant numeric := 1e-9;
  SHARE_EPS constant numeric := 1e-9;
  v_user_id uuid := auth.uid();
  v_market public.markets%rowtype;
  v_asset public.assets%rowtype;
  v_position public.positions%rowtype;
  v_decimals integer;
  v_scale numeric;
  v_b numeric;
  v_now timestamptz := now();
  v_cost_before numeric;
  v_cost_after numeric;
  v_gross_minor numeric;
  v_fee_minor numeric;
  v_net_minor numeric;
  v_trade_id uuid := gen_random_uuid();
  v_remaining_shares numeric;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_shares is null or p_shares <= 0 or p_shares < MIN_SHARE_STEP then
    raise exception 'AMOUNT_TOO_SMALL';
  end if;

  select * into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND';
  end if;
  if coalesce(v_market.market_type, 'binary') <> 'multi_choice' then
    raise exception 'MARKET_NOT_MULTI';
  end if;
  if v_market.state <> 'open' then
    raise exception 'MARKET_NOT_OPEN';
  end if;
  if v_market.closes_at <= v_now then
    raise exception 'MARKET_CLOSED';
  end if;
  if v_market.resolved_outcome_id is not null then
    raise exception 'MARKET_RESOLVED';
  end if;

  select * into v_asset
  from public.assets
  where code = coalesce(v_market.settlement_asset_code, 'VCOIN')
  for update;
  if not found or not v_asset.is_enabled then
    raise exception 'ASSET_DISABLED';
  end if;

  select * into v_position
  from public.positions
  where user_id = v_user_id
    and market_id = p_market_id
    and outcome_id = p_outcome_id
  for update;

  if not found or coalesce(v_position.shares, 0) <= 0 then
    raise exception 'NO_POSITION';
  end if;
  if v_position.shares + SHARE_EPS < p_shares then
    raise exception 'INSUFFICIENT_SHARES';
  end if;

  perform 1
  from public.market_outcome_amm_state
  where market_id = p_market_id
  for update;

  v_b := coalesce(v_market.liquidity_b, 0);
  if v_b <= 0 then
    raise exception 'INVALID_LIQUIDITY';
  end if;

  v_decimals := greatest(0, least(coalesce(v_asset.decimals, 6), 6));
  v_scale := power(10::numeric, v_decimals::numeric);

  price_before := public.lmsr_multi_prob_for_market_outcome(p_market_id, p_outcome_id, v_b);
  v_cost_before := public.lmsr_multi_cost_for_market(p_market_id, v_b);
  v_cost_after := public.lmsr_multi_cost_for_market_with_delta(
    p_market_id,
    p_outcome_id,
    -p_shares,
    v_b
  );

  if v_cost_before <= v_cost_after then
    raise exception 'AMOUNT_TOO_SMALL';
  end if;

  v_gross_minor := floor((v_cost_before - v_cost_after) * v_scale);
  if v_gross_minor <= 0 then
    raise exception 'AMOUNT_TOO_SMALL';
  end if;

  v_fee_minor := floor(v_gross_minor * coalesce(v_market.fee_bps, 0) / 10000);
  v_net_minor := v_gross_minor - v_fee_minor;
  if v_net_minor <= 0 then
    raise exception 'AMOUNT_TOO_SMALL';
  end if;

  update public.market_outcome_amm_state
  set q = q - p_shares,
      updated_at = v_now
  where market_id = p_market_id
    and outcome_id = p_outcome_id;

  perform public.refresh_market_outcome_prices(p_market_id, v_b);
  price_after := public.lmsr_multi_prob_for_market_outcome(p_market_id, p_outcome_id, v_b);

  v_remaining_shares := v_position.shares - p_shares;
  if v_remaining_shares < SHARE_EPS then
    v_remaining_shares := 0;
  end if;

  update public.positions
  set shares = v_remaining_shares,
      updated_at = v_now
  where id = v_position.id;

  update public.wallet_balances
  set balance_minor = balance_minor + v_net_minor::bigint,
      updated_at = v_now
  where user_id = v_user_id
    and asset_code = v_asset.code
  returning balance_minor into new_balance_minor;

  insert into public.wallet_transactions (id, user_id, asset_code, amount_minor, kind, market_id, trade_id, created_at)
  values (gen_random_uuid(), v_user_id, v_asset.code, v_net_minor::bigint, 'trade', p_market_id, v_trade_id, v_now);

  if v_fee_minor::bigint > 0 then
    insert into public.wallet_transactions (id, user_id, asset_code, amount_minor, kind, market_id, trade_id, created_at)
    values (gen_random_uuid(), v_user_id, v_asset.code, -v_fee_minor::bigint, 'fee', p_market_id, v_trade_id, v_now);
  end if;

  insert into public.trades (
    id,
    market_id,
    user_id,
    action,
    outcome,
    outcome_id,
    asset_code,
    collateral_gross_minor,
    fee_minor,
    collateral_net_minor,
    shares_delta,
    price_before,
    price_after,
    created_at
  ) values (
    v_trade_id,
    p_market_id,
    v_user_id,
    'sell',
    null,
    p_outcome_id,
    v_asset.code,
    v_gross_minor::bigint,
    v_fee_minor::bigint,
    v_net_minor::bigint,
    -p_shares,
    price_before,
    price_after,
    v_now
  );

  trade_id := v_trade_id;
  payout_net_minor := v_net_minor::bigint;
  shares_sold := p_shares;
  return next;
end;
$$;

drop function if exists public.resolve_market_multi_service_tx(uuid, uuid);
create or replace function public.resolve_market_multi_service_tx(
  p_market_id uuid,
  p_winning_outcome_id uuid
) returns table (
  market_id uuid,
  winning_outcome_id uuid,
  total_payout_minor bigint,
  winners_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_uid uuid := auth.uid();
  v_market public.markets%rowtype;
  v_asset public.assets%rowtype;
  v_decimals int;
  v_scale numeric;
  v_total bigint := 0;
  v_winners int := 0;
begin
  if v_role <> 'service_role' and v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND';
  end if;
  if coalesce(v_market.market_type, 'binary') <> 'multi_choice' then
    raise exception 'MARKET_NOT_MULTI';
  end if;
  if v_market.state = 'resolved' or v_market.resolved_outcome_id is not null then
    raise exception 'MARKET_ALREADY_RESOLVED';
  end if;
  if v_role <> 'service_role' then
    if v_market.created_by is null or v_market.created_by <> v_uid then
      raise exception 'CREATOR_ONLY';
    end if;
  end if;
  if v_market.expires_at is not null and v_market.expires_at > v_now then
    raise exception 'EVENT_NOT_ENDED';
  end if;

  perform 1
  from public.market_outcomes mo
  where mo.id = p_winning_outcome_id
    and mo.market_id = p_market_id
    and mo.is_active = true
  for update;
  if not found then
    raise exception 'OUTCOME_NOT_FOUND';
  end if;

  select * into v_asset
  from public.assets
  where code = coalesce(v_market.settlement_asset_code, 'VCOIN')
  for update;
  if not found or not v_asset.is_enabled then
    raise exception 'ASSET_DISABLED';
  end if;

  v_decimals := greatest(0, least(coalesce(v_asset.decimals, 6), 6));
  v_scale := power(10::numeric, v_decimals::numeric);

  update public.markets
  set resolved_outcome_id = p_winning_outcome_id,
      state = 'resolved'
  where id = p_market_id;

  with payouts as (
    select
      p.user_id,
      sum(floor(p.shares * v_scale))::bigint as payout_minor
    from public.positions p
    where p.market_id = p_market_id
      and p.outcome_id = p_winning_outcome_id
      and p.shares > 0
    group by p.user_id
    having sum(floor(p.shares * v_scale)) > 0
  )
  select
    coalesce(sum(payout_minor), 0)::bigint,
    coalesce(count(*), 0)::int
  into v_total, v_winners
  from payouts;

  insert into public.wallet_balances (user_id, asset_code, balance_minor, updated_at)
  select user_id, v_asset.code, payout_minor, v_now
  from (
    select
      p.user_id,
      sum(floor(p.shares * v_scale))::bigint as payout_minor
    from public.positions p
    where p.market_id = p_market_id
      and p.outcome_id = p_winning_outcome_id
      and p.shares > 0
    group by p.user_id
    having sum(floor(p.shares * v_scale)) > 0
  ) a
  on conflict (user_id, asset_code)
  do update set
    balance_minor = public.wallet_balances.balance_minor + excluded.balance_minor,
    updated_at = excluded.updated_at;

  insert into public.wallet_transactions (id, user_id, asset_code, amount_minor, kind, market_id, trade_id, external_ref, created_at)
  select
    gen_random_uuid(),
    user_id,
    v_asset.code,
    payout_minor,
    'payout'::public.wallet_tx_kind,
    p_market_id,
    null,
    'market:' || p_market_id::text,
    v_now
  from (
    select
      p.user_id,
      sum(floor(p.shares * v_scale))::bigint as payout_minor
    from public.positions p
    where p.market_id = p_market_id
      and p.outcome_id = p_winning_outcome_id
      and p.shares > 0
    group by p.user_id
    having sum(floor(p.shares * v_scale)) > 0
  ) t;

  market_id := p_market_id;
  winning_outcome_id := p_winning_outcome_id;
  total_payout_minor := v_total;
  winners_count := v_winners;
  return next;
end;
$$;

revoke all on function public.place_bet_multi_tx(uuid, uuid, numeric) from public;
grant execute on function public.place_bet_multi_tx(uuid, uuid, numeric) to authenticated;

revoke all on function public.sell_position_multi_tx(uuid, uuid, numeric) from public;
grant execute on function public.sell_position_multi_tx(uuid, uuid, numeric) to authenticated;

revoke all on function public.resolve_market_multi_service_tx(uuid, uuid) from public;
grant execute on function public.resolve_market_multi_service_tx(uuid, uuid) to service_role;
grant execute on function public.resolve_market_multi_service_tx(uuid, uuid) to authenticated;

commit;
