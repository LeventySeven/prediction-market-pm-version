begin;

-- Canonical public views:
-- - No email leakage (use users_public only)
-- - Must work for anon/authenticated even with locked-down base tables
-- - Views are intentionally SECURITY DEFINER (default) so we don't need to grant base-table access
--   to anon/authenticated, while still exposing only a safe subset of fields.

-- Drop dependent views first (they reference users_public).
drop view if exists public.market_comments_public;
drop view if exists public.leaderboard_public;

-- Public identity surface (PII-free)
drop view if exists public.users_public;
create view public.users_public as
select
  id,
  username,
  display_name,
  avatar_url,
  telegram_photo_url
from public.users;

revoke all on public.users_public from public;
grant select on public.users_public to anon;
grant select on public.users_public to authenticated;
grant select on public.users_public to service_role;

-- Tighten direct access to public.users: no email leakage to anon/authenticated.
revoke all on table public.users from anon;
revoke all on table public.users from authenticated;

-- Public comments view (PII-free)
create view public.market_comments_public as
select
  c.id,
  c.market_id,
  c.user_id,
  c.parent_id,
  c.body,
  c.created_at,
  coalesce(u.display_name, u.username) as author_name,
  u.username as author_username,
  coalesce(u.avatar_url, u.telegram_photo_url) as author_avatar_url,
  (
    select count(*)::int
    from public.market_comment_likes l
    where l.comment_id = c.id
  ) as likes_count
from public.market_comments c
join public.users_public u on u.id = c.user_id;

revoke all on public.market_comments_public from public;
grant select on public.market_comments_public to anon;
grant select on public.market_comments_public to authenticated;
grant select on public.market_comments_public to service_role;

-- Public leaderboard view (PII-free; uses users_public for identity)
create view public.leaderboard_public as
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
  coalesce(u.avatar_url, u.telegram_photo_url) as avatar_url,
  coalesce(w.balance_minor, 0) as balance_minor,
  coalesce(p.pnl_minor, 0) as pnl_minor,
  coalesce(b.bet_count, 0) as bet_count,
  coalesce(r.referrals, 0) as referrals,
  rank() over (order by coalesce(p.pnl_minor, 0) desc) as rank
from public.users_public u
left join public.wallet_balances w
  on w.user_id = u.id and w.asset_code = 'VCOIN'
left join pnl p on p.user_id = u.id
left join bets b on b.user_id = u.id
left join refs r on r.user_id = u.id
order by coalesce(p.pnl_minor, 0) desc, coalesce(b.bet_count, 0) desc;

revoke all on public.leaderboard_public from public;
grant select on public.leaderboard_public to anon;
grant select on public.leaderboard_public to authenticated;
grant select on public.leaderboard_public to service_role;

commit;


