begin;

create extension if not exists vector;

create table if not exists public.polymarket_market_live (
  market_id text primary key references public.polymarket_market_cache(market_id) on delete cascade,
  best_bid numeric not null default 0,
  best_ask numeric not null default 0,
  mid numeric not null default 0,
  last_trade_price numeric not null default 0,
  last_trade_size numeric not null default 0,
  rolling_24h_volume numeric not null default 0,
  open_interest numeric null,
  source_seq bigint null,
  source_ts timestamptz not null,
  updated_at timestamptz not null default now(),
  ingested_at timestamptz not null default now()
);

create index if not exists polymarket_market_live_updated_idx
  on public.polymarket_market_live (updated_at desc);

create table if not exists public.polymarket_candles_1m (
  market_id text not null references public.polymarket_market_cache(market_id) on delete cascade,
  bucket_start timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null default 0,
  trades_count integer not null default 0,
  source_ts_max timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (market_id, bucket_start)
);

create index if not exists polymarket_candles_1m_market_bucket_desc_idx
  on public.polymarket_candles_1m (market_id, bucket_start desc);

create table if not exists public.user_events (
  id bigserial primary key,
  user_id uuid null references public.users(id) on delete set null,
  session_id text not null,
  market_id text not null,
  event_type text not null check (event_type in ('view', 'dwell', 'click', 'bookmark', 'comment', 'trade_intent')),
  event_value numeric null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_events_user_created_idx
  on public.user_events (user_id, created_at desc);

create index if not exists user_events_market_created_idx
  on public.user_events (market_id, created_at desc);

create table if not exists public.market_embeddings (
  market_id text primary key references public.polymarket_market_cache(market_id) on delete cascade,
  model text not null,
  embedding vector(1536) not null,
  updated_at timestamptz not null default now()
);

create index if not exists market_embeddings_embedding_hnsw_idx
  on public.market_embeddings using hnsw (embedding vector_cosine_ops);

alter table public.polymarket_market_live enable row level security;
alter table public.polymarket_candles_1m enable row level security;
alter table public.user_events enable row level security;
alter table public.market_embeddings enable row level security;

drop policy if exists polymarket_market_live_public_read on public.polymarket_market_live;
create policy polymarket_market_live_public_read
  on public.polymarket_market_live
  for select
  to anon, authenticated
  using (true);

drop policy if exists polymarket_candles_1m_public_read on public.polymarket_candles_1m;
create policy polymarket_candles_1m_public_read
  on public.polymarket_candles_1m
  for select
  to anon, authenticated
  using (true);

-- user_events and market_embeddings are intentionally service-role only.
drop policy if exists user_events_public_read on public.user_events;
drop policy if exists market_embeddings_public_read on public.market_embeddings;

grant select on public.polymarket_market_live to anon, authenticated;
grant select on public.polymarket_candles_1m to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'polymarket_market_live'
  ) then
    execute 'alter publication supabase_realtime add table public.polymarket_market_live';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'polymarket_candles_1m'
  ) then
    execute 'alter publication supabase_realtime add table public.polymarket_candles_1m';
  end if;
end
$$;

commit;
