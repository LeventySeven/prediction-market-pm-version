begin;

create extension if not exists pgcrypto;

create table if not exists public.market_catalog (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('polymarket', 'limitless')),
  provider_market_id text not null,
  provider_condition_id text null,
  slug text not null,
  title text not null,
  description text null,
  state text not null check (state in ('open', 'closed', 'resolved', 'cancelled')),
  category text null,
  source_url text null,
  image_url text null,
  provider_payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_market_id)
);

create index if not exists market_catalog_provider_state_idx
  on public.market_catalog (provider, state);

create index if not exists market_catalog_last_synced_idx
  on public.market_catalog (last_synced_at desc);

create table if not exists public.market_outcomes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.market_catalog(id) on delete cascade,
  provider_outcome_id text null,
  provider_token_id text null,
  outcome_key text not null,
  title text not null,
  sort_order integer not null default 0,
  probability numeric not null default 0,
  price numeric not null default 0,
  is_active boolean not null default true,
  provider_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (market_id, sort_order),
  unique (market_id, outcome_key)
);

create index if not exists market_outcomes_market_idx
  on public.market_outcomes (market_id, sort_order);

create index if not exists market_outcomes_provider_token_idx
  on public.market_outcomes (provider_token_id)
  where provider_token_id is not null;

create table if not exists public.market_live (
  market_id uuid primary key references public.market_catalog(id) on delete cascade,
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

create index if not exists market_live_updated_idx
  on public.market_live (updated_at desc);

create table if not exists public.market_candles_1m (
  market_id uuid not null references public.market_catalog(id) on delete cascade,
  outcome_key text not null default '__market__',
  bucket_start timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null default 0,
  trades_count integer not null default 0,
  source_ts_max timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (market_id, outcome_key, bucket_start)
);

create index if not exists market_candles_1m_market_bucket_desc_idx
  on public.market_candles_1m (market_id, bucket_start desc);

create table if not exists public.provider_sync_state (
  provider text not null check (provider in ('polymarket', 'limitless')),
  scope text not null,
  last_started_at timestamptz null,
  last_success_at timestamptz null,
  last_error text null,
  updated_at timestamptz not null default now(),
  primary key (provider, scope)
);

create table if not exists public.trade_relay_audit (
  id bigserial primary key,
  provider text not null check (provider in ('polymarket', 'limitless')),
  user_id uuid null references public.users(id) on delete set null,
  market_ref_id uuid null references public.market_catalog(id) on delete set null,
  idempotency_key text not null,
  client_order_id text null,
  order_hash text not null,
  status text not null check (status in ('pending', 'success', 'failed', 'rejected', 'duplicate')),
  http_status integer null,
  error_code text null,
  error_message text null,
  request_ip text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, user_id, idempotency_key)
);

create index if not exists trade_relay_audit_provider_created_idx
  on public.trade_relay_audit (provider, created_at desc);

create table if not exists public.api_rate_limits (
  key text primary key,
  window_started_at timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists api_rate_limits_updated_idx
  on public.api_rate_limits (updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists market_catalog_set_updated_at on public.market_catalog;
create trigger market_catalog_set_updated_at
before update on public.market_catalog
for each row execute function public.set_updated_at();

drop trigger if exists market_outcomes_set_updated_at on public.market_outcomes;
create trigger market_outcomes_set_updated_at
before update on public.market_outcomes
for each row execute function public.set_updated_at();

drop trigger if exists market_live_set_updated_at on public.market_live;
create trigger market_live_set_updated_at
before update on public.market_live
for each row execute function public.set_updated_at();

drop trigger if exists market_candles_1m_set_updated_at on public.market_candles_1m;
create trigger market_candles_1m_set_updated_at
before update on public.market_candles_1m
for each row execute function public.set_updated_at();

drop trigger if exists provider_sync_state_set_updated_at on public.provider_sync_state;
create trigger provider_sync_state_set_updated_at
before update on public.provider_sync_state
for each row execute function public.set_updated_at();

drop trigger if exists trade_relay_audit_set_updated_at on public.trade_relay_audit;
create trigger trade_relay_audit_set_updated_at
before update on public.trade_relay_audit
for each row execute function public.set_updated_at();

drop trigger if exists api_rate_limits_set_updated_at on public.api_rate_limits;
create trigger api_rate_limits_set_updated_at
before update on public.api_rate_limits
for each row execute function public.set_updated_at();

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  window_start timestamptz;
  next_count integer;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'RATE_LIMIT_KEY_REQUIRED';
  end if;
  if p_limit <= 0 then
    raise exception 'RATE_LIMIT_LIMIT_INVALID';
  end if;
  if p_window_seconds <= 0 then
    raise exception 'RATE_LIMIT_WINDOW_INVALID';
  end if;

  window_start := to_timestamp(floor(extract(epoch from now_ts) / p_window_seconds) * p_window_seconds);

  insert into public.api_rate_limits as r (key, window_started_at, count, updated_at)
  values (p_key, window_start, 1, now_ts)
  on conflict (key)
  do update set
    count = case
      when r.window_started_at = excluded.window_started_at then r.count + 1
      else 1
    end,
    window_started_at = case
      when r.window_started_at = excluded.window_started_at then r.window_started_at
      else excluded.window_started_at
    end,
    updated_at = excluded.updated_at
  returning r.count into next_count;

  if next_count <= p_limit then
    allowed := true;
  else
    allowed := false;
  end if;

  remaining := greatest(0, p_limit - next_count);
  reset_at := window_start + make_interval(secs => p_window_seconds);
  return next;
end
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated, anon, service_role;

alter table if exists public.market_comments
  add column if not exists market_ref_id uuid null references public.market_catalog(id) on delete set null;
alter table if exists public.market_bookmarks
  add column if not exists market_ref_id uuid null references public.market_catalog(id) on delete set null;
alter table if exists public.market_context
  add column if not exists market_ref_id uuid null references public.market_catalog(id) on delete set null;
alter table if exists public.market_embeddings
  add column if not exists market_ref_id uuid null references public.market_catalog(id) on delete set null;
alter table if exists public.user_events
  add column if not exists market_ref_id uuid null references public.market_catalog(id) on delete set null;

create index if not exists market_comments_market_ref_id_idx
  on public.market_comments (market_ref_id)
  where market_ref_id is not null;

create index if not exists market_bookmarks_market_ref_id_idx
  on public.market_bookmarks (market_ref_id)
  where market_ref_id is not null;

create unique index if not exists market_context_market_ref_id_uidx
  on public.market_context (market_ref_id)
  where market_ref_id is not null;

create unique index if not exists market_embeddings_market_ref_id_uidx
  on public.market_embeddings (market_ref_id)
  where market_ref_id is not null;

create index if not exists user_events_market_ref_id_idx
  on public.user_events (market_ref_id)
  where market_ref_id is not null;

insert into public.market_catalog (
  provider,
  provider_market_id,
  provider_condition_id,
  slug,
  title,
  description,
  state,
  category,
  source_url,
  image_url,
  provider_payload,
  source_updated_at,
  last_synced_at
)
select
  'polymarket' as provider,
  m.market_id as provider_market_id,
  m.condition_id as provider_condition_id,
  m.slug,
  m.title,
  m.description,
  m.state,
  m.category,
  m.source_url,
  m.image_url,
  jsonb_build_object(
    'legacy_table', 'polymarket_market_cache',
    'clob_token_ids', coalesce(m.clob_token_ids, '[]'::jsonb),
    'outcomes', coalesce(m.outcomes, '[]'::jsonb)
  ) as provider_payload,
  m.source_updated_at,
  m.last_synced_at
from public.polymarket_market_cache m
on conflict (provider, provider_market_id)
do update set
  provider_condition_id = excluded.provider_condition_id,
  slug = excluded.slug,
  title = excluded.title,
  description = excluded.description,
  state = excluded.state,
  category = excluded.category,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  provider_payload = excluded.provider_payload,
  source_updated_at = excluded.source_updated_at,
  last_synced_at = excluded.last_synced_at,
  updated_at = now();

insert into public.market_outcomes (
  market_id,
  provider_outcome_id,
  provider_token_id,
  outcome_key,
  title,
  sort_order,
  probability,
  price,
  is_active,
  provider_payload
)
select
  c.id as market_id,
  nullif(o.outcome->>'id', ''),
  nullif(o.outcome->>'tokenId', ''),
  coalesce(
    nullif(o.outcome->>'id', ''),
    nullif(o.outcome->>'tokenId', ''),
    concat('outcome_', o.ordinality::text)
  ) as outcome_key,
  coalesce(nullif(o.outcome->>'title', ''), concat('Outcome ', o.ordinality::text)) as title,
  greatest(o.ordinality - 1, 0)::integer as sort_order,
  coalesce((o.outcome->>'probability')::numeric, 0) as probability,
  coalesce((o.outcome->>'price')::numeric, coalesce((o.outcome->>'probability')::numeric, 0)) as price,
  coalesce((o.outcome->>'isActive')::boolean, true) as is_active,
  o.outcome as provider_payload
from public.polymarket_market_cache m
join public.market_catalog c
  on c.provider = 'polymarket'
 and c.provider_market_id = m.market_id
cross join lateral jsonb_array_elements(coalesce(m.outcomes, '[]'::jsonb)) with ordinality as o(outcome, ordinality)
on conflict (market_id, outcome_key)
do update set
  provider_outcome_id = excluded.provider_outcome_id,
  provider_token_id = excluded.provider_token_id,
  title = excluded.title,
  sort_order = excluded.sort_order,
  probability = excluded.probability,
  price = excluded.price,
  is_active = excluded.is_active,
  provider_payload = excluded.provider_payload,
  updated_at = now();

insert into public.market_live (
  market_id,
  best_bid,
  best_ask,
  mid,
  last_trade_price,
  last_trade_size,
  rolling_24h_volume,
  open_interest,
  source_seq,
  source_ts,
  updated_at,
  ingested_at
)
select
  c.id,
  l.best_bid,
  l.best_ask,
  l.mid,
  l.last_trade_price,
  l.last_trade_size,
  l.rolling_24h_volume,
  l.open_interest,
  l.source_seq,
  l.source_ts,
  l.updated_at,
  l.ingested_at
from public.polymarket_market_live l
join public.market_catalog c
  on c.provider = 'polymarket'
 and c.provider_market_id = l.market_id
on conflict (market_id)
do update set
  best_bid = excluded.best_bid,
  best_ask = excluded.best_ask,
  mid = excluded.mid,
  last_trade_price = excluded.last_trade_price,
  last_trade_size = excluded.last_trade_size,
  rolling_24h_volume = excluded.rolling_24h_volume,
  open_interest = excluded.open_interest,
  source_seq = excluded.source_seq,
  source_ts = excluded.source_ts,
  updated_at = excluded.updated_at,
  ingested_at = excluded.ingested_at;

insert into public.market_candles_1m (
  market_id,
  outcome_key,
  bucket_start,
  open,
  high,
  low,
  close,
  volume,
  trades_count,
  source_ts_max,
  updated_at
)
select
  c.id,
  '__market__',
  k.bucket_start,
  k.open,
  k.high,
  k.low,
  k.close,
  k.volume,
  k.trades_count,
  k.source_ts_max,
  k.updated_at
from public.polymarket_candles_1m k
join public.market_catalog c
  on c.provider = 'polymarket'
 and c.provider_market_id = k.market_id
on conflict (market_id, outcome_key, bucket_start)
do update set
  open = excluded.open,
  high = excluded.high,
  low = excluded.low,
  close = excluded.close,
  volume = excluded.volume,
  trades_count = excluded.trades_count,
  source_ts_max = excluded.source_ts_max,
  updated_at = excluded.updated_at;

insert into public.provider_sync_state (
  provider,
  scope,
  last_started_at,
  last_success_at,
  last_error,
  updated_at
)
select
  'polymarket',
  s.scope,
  s.last_started_at,
  s.last_success_at,
  s.last_error,
  s.updated_at
from public.polymarket_sync_state s
on conflict (provider, scope)
do update set
  last_started_at = excluded.last_started_at,
  last_success_at = excluded.last_success_at,
  last_error = excluded.last_error,
  updated_at = excluded.updated_at;

update public.market_comments m
set market_ref_id = c.id
from public.market_catalog c
where m.market_ref_id is null
  and c.provider = 'polymarket'
  and c.provider_market_id = m.market_id;

update public.market_bookmarks m
set market_ref_id = c.id
from public.market_catalog c
where m.market_ref_id is null
  and c.provider = 'polymarket'
  and c.provider_market_id = m.market_id;

update public.market_context m
set market_ref_id = c.id
from public.market_catalog c
where m.market_ref_id is null
  and c.provider = 'polymarket'
  and c.provider_market_id = m.market_id;

update public.market_embeddings m
set market_ref_id = c.id
from public.market_catalog c
where m.market_ref_id is null
  and c.provider = 'polymarket'
  and c.provider_market_id = m.market_id;

update public.user_events m
set market_ref_id = c.id
from public.market_catalog c
where m.market_ref_id is null
  and c.provider = 'polymarket'
  and c.provider_market_id = m.market_id;

alter table public.market_catalog enable row level security;
alter table public.market_outcomes enable row level security;
alter table public.market_live enable row level security;
alter table public.market_candles_1m enable row level security;
alter table public.provider_sync_state enable row level security;
alter table public.trade_relay_audit enable row level security;
alter table public.api_rate_limits enable row level security;

alter table public.users enable row level security;
alter table public.wallet_balances enable row level security;
alter table public.user_referrals enable row level security;
alter table public.market_comments enable row level security;
alter table public.market_comment_likes enable row level security;
alter table public.market_bookmarks enable row level security;
alter table public.market_context enable row level security;
alter table public.polymarket_market_cache enable row level security;
alter table public.polymarket_sync_state enable row level security;

-- Public read tables for catalog + realtime.
drop policy if exists market_catalog_public_read on public.market_catalog;
create policy market_catalog_public_read
  on public.market_catalog
  for select
  to anon, authenticated
  using (true);

drop policy if exists market_outcomes_public_read on public.market_outcomes;
create policy market_outcomes_public_read
  on public.market_outcomes
  for select
  to anon, authenticated
  using (true);

drop policy if exists market_live_public_read on public.market_live;
create policy market_live_public_read
  on public.market_live
  for select
  to anon, authenticated
  using (true);

drop policy if exists market_candles_1m_public_read on public.market_candles_1m;
create policy market_candles_1m_public_read
  on public.market_candles_1m
  for select
  to anon, authenticated
  using (true);

-- Social/public read + owner write where it is safe.
drop policy if exists market_comments_public_read on public.market_comments;
create policy market_comments_public_read
  on public.market_comments
  for select
  to anon, authenticated
  using (true);

drop policy if exists market_comments_owner_write on public.market_comments;
create policy market_comments_owner_write
  on public.market_comments
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists market_comment_likes_public_read on public.market_comment_likes;
create policy market_comment_likes_public_read
  on public.market_comment_likes
  for select
  to anon, authenticated
  using (true);

drop policy if exists market_comment_likes_owner_write on public.market_comment_likes;
create policy market_comment_likes_owner_write
  on public.market_comment_likes
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists market_bookmarks_owner_rw on public.market_bookmarks;
create policy market_bookmarks_owner_rw
  on public.market_bookmarks
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists users_self_read on public.users;
create policy users_self_read
  on public.users
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists users_self_update on public.users;
create policy users_self_update
  on public.users
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists wallet_balances_owner_read on public.wallet_balances;
create policy wallet_balances_owner_read
  on public.wallet_balances
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_referrals_owner_read on public.user_referrals;
create policy user_referrals_owner_read
  on public.user_referrals
  for select
  to authenticated
  using (auth.uid() = user_id or auth.uid() = referrer_user_id);

-- Keep these tables service-role only: no anon/auth policies.
drop policy if exists provider_sync_state_public_read on public.provider_sync_state;
drop policy if exists trade_relay_audit_public_read on public.trade_relay_audit;
drop policy if exists api_rate_limits_public_read on public.api_rate_limits;

grant select on public.market_catalog to anon, authenticated;
grant select on public.market_outcomes to anon, authenticated;
grant select on public.market_live to anon, authenticated;
grant select on public.market_candles_1m to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'market_live'
  ) then
    execute 'alter publication supabase_realtime add table public.market_live';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'market_candles_1m'
  ) then
    execute 'alter publication supabase_realtime add table public.market_candles_1m';
  end if;
end
$$;

commit;
