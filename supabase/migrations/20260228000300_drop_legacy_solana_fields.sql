begin;

alter table if exists public.users
  drop column if exists solana_wallet_address,
  drop column if exists solana_cluster,
  drop column if exists solana_wallet_connected_at;

commit;
