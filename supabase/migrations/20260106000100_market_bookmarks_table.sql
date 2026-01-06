create table if not exists public.market_bookmarks (
  user_id uuid not null references public.users(id) on delete cascade,
  market_id uuid not null references public.markets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, market_id)
);

create index if not exists market_bookmarks_user_id_idx
  on public.market_bookmarks (user_id);

create index if not exists market_bookmarks_market_id_idx
  on public.market_bookmarks (market_id);

alter table public.market_bookmarks enable row level security;

-- Bookmarks are private: only the owner can read/write.
drop policy if exists "market_bookmarks_select_own" on public.market_bookmarks;
create policy "market_bookmarks_select_own"
  on public.market_bookmarks
  for select
  using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "market_bookmarks_insert_own" on public.market_bookmarks;
create policy "market_bookmarks_insert_own"
  on public.market_bookmarks
  for insert
  with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "market_bookmarks_delete_own" on public.market_bookmarks;
create policy "market_bookmarks_delete_own"
  on public.market_bookmarks
  for delete
  using (auth.uid() is not null and user_id = auth.uid());

grant select on table public.market_bookmarks to authenticated;
grant all on table public.market_bookmarks to service_role;


