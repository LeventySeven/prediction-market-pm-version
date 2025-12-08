-- Resolves a market and pays out winners in one transaction.
-- Parameters:
--   p_market_id bigint
--   p_outcome text ('YES' | 'NO')
-- Returns:
--   market_id bigint
--   outcome text
--   total_pool numeric
--   winner_pool numeric
--   updated_bets_count int
create or replace function resolve_market_tx(
    p_market_id bigint,
    p_outcome text
) returns table (
  market_id bigint,
  outcome text,
  total_pool numeric,
  winner_pool numeric,
  updated_bets_count int
) language plpgsql
security definer
set search_path = public
as $$
declare
  v_pool_yes numeric;
  v_pool_no numeric;
begin
  select pool_yes, pool_no, outcome
    into v_pool_yes, v_pool_no, outcome
  from markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND';
  end if;

  total_pool := coalesce(v_pool_yes, 0) + coalesce(v_pool_no, 0);
  winner_pool := case when p_outcome = 'YES' then coalesce(v_pool_yes, 0) else coalesce(v_pool_no, 0) end;

  -- Idempotent: if already resolved with same outcome, just return summary
  if outcome is not null and outcome = p_outcome then
    updated_bets_count := (select count(*) from bets where market_id = p_market_id and status in ('won','lost'));
    return query select p_market_id, p_outcome, total_pool, winner_pool, updated_bets_count;
    return;
  end if;

  -- Update bets and payouts
  update bets
    set status = case when side = p_outcome then 'won' else 'lost' end,
        payout = case when side = p_outcome and winner_pool > 0
                      then amount * (total_pool / winner_pool)
                      else 0 end
  where market_id = p_market_id
    and status = 'open';

  -- Pay winners
  update users u
    set balance = balance + b.payout
  from bets b
  where b.market_id = p_market_id
    and b.status = 'won'
    and b.user_id = u.id;

  updated_bets_count := (select count(*) from bets where market_id = p_market_id and status in ('won','lost'));

  update markets set outcome = p_outcome where id = p_market_id;

  return query select p_market_id, p_outcome, total_pool, winner_pool, updated_bets_count;
end;
$$;

