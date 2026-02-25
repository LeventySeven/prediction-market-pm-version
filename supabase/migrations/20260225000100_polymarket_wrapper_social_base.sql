begin;

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  username text not null unique,
  display_name text null,
  avatar_url text null,
  telegram_id bigint null unique,
  telegram_username text null,
  telegram_first_name text null,
  telegram_last_name text null,
  telegram_photo_url text null,
  telegram_auth_date timestamptz null,
  referral_code text null unique,
  referral_commission_rate numeric null,
  referral_enabled boolean null,
  is_admin boolean not null default false,
  solana_wallet_address text null unique,
  solana_cluster text null,
  solana_wallet_connected_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_balances (
  user_id uuid not null references public.users(id) on delete cascade,
  asset_code text not null,
  balance_minor bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, asset_code)
);

create table if not exists public.user_referrals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  referrer_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.market_comments (
  id uuid primary key default gen_random_uuid(),
  market_id text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  parent_id uuid null references public.market_comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists market_comments_market_id_created_idx
  on public.market_comments (market_id, created_at desc);

create table if not exists public.market_comment_likes (
  comment_id uuid not null references public.market_comments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.market_bookmarks (
  user_id uuid not null references public.users(id) on delete cascade,
  market_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, market_id)
);

create index if not exists market_bookmarks_user_created_idx
  on public.market_bookmarks (user_id, created_at desc);

create table if not exists public.market_context (
  market_id text primary key,
  context text not null,
  sources jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

commit;

