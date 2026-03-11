begin;

alter table if exists public.market_catalog
  add column if not exists market_created_at timestamptz null,
  add column if not exists closes_at timestamptz null,
  add column if not exists expires_at timestamptz null,
  add column if not exists market_type text null check (market_type in ('binary', 'multi_choice')),
  add column if not exists resolved_outcome_title text null,
  add column if not exists total_volume_usd numeric not null default 0;

update public.market_catalog
set
  market_created_at = coalesce(
    market_created_at,
    nullif(provider_payload ->> 'created_at', '')::timestamptz,
    nullif(provider_payload ->> 'market_created_at', '')::timestamptz,
    created_at
  ),
  closes_at = coalesce(
    closes_at,
    nullif(provider_payload ->> 'closes_at', '')::timestamptz,
    market_created_at,
    created_at
  ),
  expires_at = coalesce(
    expires_at,
    nullif(provider_payload ->> 'expires_at', '')::timestamptz,
    closes_at,
    market_created_at,
    created_at
  ),
  market_type = coalesce(
    market_type,
    nullif(provider_payload ->> 'market_type', ''),
    case
      when (
        select count(*)
        from public.market_outcomes mo
        where mo.market_id = public.market_catalog.id
      ) > 2 then 'multi_choice'
      else 'binary'
    end
  ),
  resolved_outcome_title = coalesce(
    resolved_outcome_title,
    nullif(provider_payload ->> 'resolved_outcome_title', '')
  ),
  total_volume_usd = greatest(
    0,
    coalesce(
      total_volume_usd,
      nullif(provider_payload ->> 'total_volume_usd', '')::numeric,
      nullif(provider_payload ->> 'volume', '')::numeric,
      0
    )
  );

alter table if exists public.market_catalog
  alter column market_created_at set not null,
  alter column closes_at set not null,
  alter column expires_at set not null,
  alter column market_type set not null;

create index if not exists market_catalog_provider_state_total_volume_idx
  on public.market_catalog (provider, state, total_volume_usd desc);

create index if not exists market_catalog_provider_state_created_at_idx
  on public.market_catalog (provider, state, market_created_at desc);

commit;
