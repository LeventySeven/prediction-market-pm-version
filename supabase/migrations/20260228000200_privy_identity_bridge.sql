begin;

alter table if exists public.users
  add column if not exists privy_user_id text null,
  add column if not exists privy_wallet_address text null,
  add column if not exists auth_provider text not null default 'legacy';

create unique index if not exists users_privy_user_id_unique_idx
  on public.users (privy_user_id)
  where privy_user_id is not null;

commit;
