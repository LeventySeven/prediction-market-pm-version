-- Public leaderboard (no mocks): aggregate per-user profit + bet count + balance.
-- Profit is computed from wallet_transactions excluding deposits/withdraws:
--   kind in ('trade', 'payout', 'fee')
-- This is *realized* (cashflow-based) PnL.

begin;

drop view if exists public.leaderboard_public;

create or replace view public.leaderboard_public
with (security_invoker = true)
as
with
  pnl as (
    select
      user_id,
      coalesce(sum(amount_minor), 0) as pnl_minor
    from public.wallet_transactions
    where kind in ('trade', 'payout', 'fee')
    group by user_id
  ),
  bets as (
    select
      user_id,
      count(*) as bet_count
    from public.trades
    where action = 'buy'
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
  coalesce(w.balance_minor, 0) as balance_minor,
  coalesce(p.pnl_minor, 0) as pnl_minor,
  coalesce(b.bet_count, 0) as bet_count,
  coalesce(r.referrals, 0) as referrals,
  rank() over (order by coalesce(p.pnl_minor, 0) desc) as rank
from public.users u
left join public.wallet_balances w
  on w.user_id = u.id and w.asset_code = 'VCOIN'
left join pnl p on p.user_id = u.id
left join bets b on b.user_id = u.id
left join refs r on r.user_id = u.id
order by coalesce(p.pnl_minor, 0) desc, coalesce(b.bet_count, 0) desc, u.created_at asc;

revoke all on public.leaderboard_public from public;
grant select on public.leaderboard_public to anon;
grant select on public.leaderboard_public to authenticated;

commit;


