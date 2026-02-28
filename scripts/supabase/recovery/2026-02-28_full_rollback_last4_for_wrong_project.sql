-- Recovery script (full rollback for wrong-project push, idempotent)
-- Rolls back effects from migrations:
--   20260228000100_polymarket_market_cache.sql
--   20260228000200_privy_identity_bridge.sql
--   20260228000300_drop_legacy_solana_fields.sql
--
-- IMPORTANT:
-- 1) This script is intended for the WRONG project that accidentally received these migrations.
-- 2) It drops cache tables and Privy columns added by the last migrations.
-- 3) Run only after confirming this target should return to pre-wrapper state.

begin;

-- 1) Restore deleted Solana fields (from DB_CONTEXT snapshot)
alter table if exists public.users
  add column if not exists solana_wallet_address text null,
  add column if not exists solana_cluster text null,
  add column if not exists solana_wallet_connected_at timestamptz null;

create unique index if not exists users_solana_wallet_address_unique_idx
  on public.users (solana_wallet_address)
  where solana_wallet_address is not null;

-- 2) Remove Privy identity bridge additions
drop index if exists public.users_privy_user_id_unique_idx;

alter table if exists public.users
  drop column if exists privy_user_id,
  drop column if exists privy_wallet_address,
  drop column if exists auth_provider;

-- 3) Remove Polymarket cache/sync tables
drop table if exists public.polymarket_sync_state;
drop table if exists public.polymarket_market_cache;

commit;

-- Verification queries:
-- select column_name
-- from information_schema.columns
-- where table_schema='public' and table_name='users'
--   and column_name in ('solana_wallet_address','solana_cluster','solana_wallet_connected_at','privy_user_id','privy_wallet_address','auth_provider')
-- order by column_name;
--
-- select to_regclass('public.polymarket_market_cache') as polymarket_market_cache,
--        to_regclass('public.polymarket_sync_state') as polymarket_sync_state;
