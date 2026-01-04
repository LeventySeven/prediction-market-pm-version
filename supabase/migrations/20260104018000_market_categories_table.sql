create table if not exists public.market_categories (
  id text primary key,
  label_ru text not null,
  label_en text not null,
  is_enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.market_categories enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'market_categories'
      and policyname = 'Market categories are readable by everyone'
  ) then
    create policy "Market categories are readable by everyone"
      on public.market_categories
      for select
      using (true);
  end if;
end
$$;

-- Prepared categories (id is stable and used as markets.category_id)
insert into public.market_categories (id, label_ru, label_en, is_enabled, sort_order) values
  ('crypto', 'Крипто', 'Crypto', true, 10),
  ('politics', 'Политика', 'Politics', true, 20),
  ('world', 'Мир', 'World', true, 30),
  ('tech', 'Технологии', 'Tech', true, 40),
  ('sports', 'Спорт', 'Sports', true, 50),
  ('social', 'Соцсети', 'Social', true, 60),
  ('science', 'Наука', 'Science', true, 70),
  ('music', 'Музыка', 'Music', true, 80),
  ('celebs', 'Звёзды', 'Celebs', true, 90)
on conflict (id) do update set
  label_ru = excluded.label_ru,
  label_en = excluded.label_en,
  is_enabled = excluded.is_enabled,
  sort_order = excluded.sort_order;

grant select on table public.market_categories to anon;
grant select on table public.market_categories to authenticated;
grant all on table public.market_categories to service_role;


