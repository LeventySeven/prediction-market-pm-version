begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.polymarket_market_cache (
  market_id text primary key,
  condition_id text not null,
  slug text not null,
  title text not null,
  description text null,
  image_url text null,
  source_url text null,
  state text not null check (state in ('open', 'closed', 'resolved', 'cancelled')),
  market_created_at timestamptz not null,
  closes_at timestamptz not null,
  expires_at timestamptz not null,
  category text null,
  volume numeric not null default 0,
  clob_token_ids jsonb not null default '[]'::jsonb,
  outcomes jsonb not null default '[]'::jsonb,
  resolved_outcome_title text null,
  search_text text not null default '',
  source_updated_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now()
);

create index if not exists polymarket_market_cache_state_idx
  on public.polymarket_market_cache (state);

create index if not exists polymarket_market_cache_volume_idx
  on public.polymarket_market_cache (volume desc);

create index if not exists polymarket_market_cache_last_synced_idx
  on public.polymarket_market_cache (last_synced_at desc);

create index if not exists polymarket_market_cache_search_trgm_idx
  on public.polymarket_market_cache
  using gin (search_text gin_trgm_ops);

create table if not exists public.polymarket_sync_state (
  scope text primary key,
  last_started_at timestamptz null,
  last_success_at timestamptz null,
  last_error text null,
  updated_at timestamptz not null default now()
);

commit;
