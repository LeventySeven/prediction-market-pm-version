begin;

-- Ensure leaderboard uses consistent asset scope (VCOIN only).
-- Without this, USDC/USDT wallet txs and trades can skew pnl/bet_count and make the leaderboard look inconsistent.

create or replace view public.leaderboard_public
with (security_barrier = true)
as
with
  pnl as (
    select
      user_id,
      coalesce(sum(amount_minor), 0) as pnl_minor
    from public.wallet_transactions
    where kind in ('trade', 'payout', 'fee')
      and asset_code = 'VCOIN'
    group by user_id
  ),
  bets as (
    select
      user_id,
      count(*) as bet_count
    from public.trades
    where action = 'buy'
      and asset_code = 'VCOIN'
    group by user_id
  ),
  refs as (
    select
      referrer_user_id as user_id,
      count(*) as referrals
    from public.user_referrals
    where referrer_user_id is not null
    group by referrer_user_id
  )
select
  u.id as user_id,
  coalesce(u.display_name, u.username) as name,
  u.username as username,
  coalesce(u.avatar_url, u.telegram_photo_url) as avatar_url,
  coalesce(w.balance_minor, 0) as balance_minor,
  coalesce(p.pnl_minor, 0) as pnl_minor,
  coalesce(b.bet_count, 0) as bet_count,
  coalesce(r.referrals, 0) as referrals,
  row_number() over (
    order by
      coalesce(p.pnl_minor, 0) desc,
      coalesce(b.bet_count, 0) desc,
      coalesce(w.balance_minor, 0) desc,
      u.id asc
  ) as rank
from public.users_public u
left join public.wallet_balances w
  on w.user_id = u.id and w.asset_code = 'VCOIN'
left join pnl p on p.user_id = u.id
left join bets b on b.user_id = u.id
left join refs r on r.user_id = u.id;

revoke all on public.leaderboard_public from public;
grant select on public.leaderboard_public to anon;
grant select on public.leaderboard_public to authenticated;
grant select on public.leaderboard_public to service_role;

commit;

