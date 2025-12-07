-- Wraps bet placement in a single transaction.
-- Parameters:
--   p_user_id bigint
--   p_market_id bigint
--   p_side text ('YES' | 'NO')
--   p_amount numeric
-- Returns:
--   bet_id bigint
--   new_balance numeric
create or replace function place_bet_tx(
    p_user_id bigint,
    p_market_id bigint,
    p_side text,
    p_amount numeric
) returns table (bet_id bigint, new_balance numeric)
language plpgsql
as $$
declare
  v_balance numeric;
  v_bet_id bigint;
begin
  perform id from users where id = p_user_id for update;
  select balance into v_balance from users where id = p_user_id;
  if v_balance is null then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_balance < p_amount then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  perform id, outcome from markets where id = p_market_id for update;
  if not found then
    raise exception 'MARKET_NOT_FOUND';
  end if;
  if (select outcome from markets where id = p_market_id) is not null then
    raise exception 'MARKET_RESOLVED';
  end if;

  update users set balance = balance - p_amount where id = p_user_id;

  if p_side = 'YES' then
    update markets set pool_yes = pool_yes + p_amount where id = p_market_id;
  else
    update markets set pool_no = pool_no + p_amount where id = p_market_id;
  end if;

  insert into bets(user_id, market_id, side, amount, status)
  values(p_user_id, p_market_id, p_side, p_amount, 'open')
  returning id into v_bet_id;

  select balance into new_balance from users where id = p_user_id;

  return query
    select v_bet_id::bigint as bet_id, new_balance::numeric as new_balance;
end;
$$;

