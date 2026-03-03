begin;

create table if not exists public.polymarket_market_ticks (
  id bigserial primary key,
  market_id text not null references public.polymarket_market_cache(market_id) on delete cascade,
  trade_id text null,
  source_seq bigint null,
  source_ts timestamptz not null,
  side text not null default 'UNKNOWN' check (side in ('BUY', 'SELL', 'UNKNOWN')),
  outcome text null,
  price numeric not null check (price >= 0 and price <= 1),
  size numeric not null check (size >= 0),
  notional numeric generated always as (price * size) stored,
  dedupe_key text not null unique,
  payload jsonb null,
  created_at timestamptz not null default now(),
  ingested_at timestamptz not null default now()
);

create index if not exists polymarket_market_ticks_market_source_desc_idx
  on public.polymarket_market_ticks (market_id, source_ts desc, id desc);

create index if not exists polymarket_market_ticks_source_ts_desc_idx
  on public.polymarket_market_ticks (source_ts desc);

create index if not exists polymarket_market_cache_state_created_idx
  on public.polymarket_market_cache (state, market_created_at desc);

create index if not exists polymarket_market_cache_state_volume_idx
  on public.polymarket_market_cache (state, volume desc);

alter table public.polymarket_market_ticks enable row level security;

drop policy if exists polymarket_market_ticks_public_read on public.polymarket_market_ticks;
create policy polymarket_market_ticks_public_read
  on public.polymarket_market_ticks
  for select
  to anon, authenticated
  using (true);

grant select on public.polymarket_market_ticks to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'polymarket_market_ticks'
  ) then
    execute 'alter publication supabase_realtime add table public.polymarket_market_ticks';
  end if;
end
$$;

commit;
