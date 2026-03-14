begin;

create extension if not exists pgcrypto;

create table if not exists public.market_compare_groups (
  id uuid primary key default gen_random_uuid(),
  normalized_question text not null,
  normalized_closes_at timestamptz not null,
  category text null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_question, normalized_closes_at, category)
);

create table if not exists public.market_compare_members (
  compare_group_id uuid not null references public.market_compare_groups(id) on delete cascade,
  market_id uuid not null references public.market_catalog(id) on delete cascade,
  provider text not null check (provider in ('polymarket', 'limitless')),
  outcome_map jsonb not null default '{}'::jsonb,
  match_confidence numeric not null default 0,
  match_source text not null default 'auto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (compare_group_id, market_id),
  unique (market_id)
);

alter table if exists public.market_catalog
  add column if not exists compare_group_id uuid null references public.market_compare_groups(id) on delete set null;

create index if not exists market_catalog_compare_group_idx
  on public.market_catalog (compare_group_id)
  where compare_group_id is not null;

create index if not exists market_compare_groups_status_closes_idx
  on public.market_compare_groups (status, normalized_closes_at desc);

create index if not exists market_compare_members_market_idx
  on public.market_compare_members (market_id);

create index if not exists market_compare_members_group_provider_idx
  on public.market_compare_members (compare_group_id, provider);

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_updated_at'
  ) then
    execute 'drop trigger if exists market_compare_groups_set_updated_at on public.market_compare_groups';
    execute 'create trigger market_compare_groups_set_updated_at before update on public.market_compare_groups for each row execute function public.set_updated_at()';
    execute 'drop trigger if exists market_compare_members_set_updated_at on public.market_compare_members';
    execute 'create trigger market_compare_members_set_updated_at before update on public.market_compare_members for each row execute function public.set_updated_at()';
  end if;
end
$$;

commit;
