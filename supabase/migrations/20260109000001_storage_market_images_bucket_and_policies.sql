-- Storage bucket + RLS policies for market images
-- Bucket is public so images can be rendered without auth.
-- Authenticated users can upload market images

begin;

insert into storage.buckets (id, name, public)
values ('market-images', 'market-images', true)
on conflict (id) do update set public = excluded.public;

-- Public read
drop policy if exists "public read market images" on storage.objects;
create policy "public read market images"
on storage.objects
for select
using (bucket_id = 'market-images');

-- Authenticated users can upload images
drop policy if exists "authenticated insert market images" on storage.objects;
create policy "authenticated insert market images"
on storage.objects
for insert
with check (
  bucket_id = 'market-images'
  and auth.uid() is not null
);

-- Authenticated users can update images
drop policy if exists "authenticated update market images" on storage.objects;
create policy "authenticated update market images"
on storage.objects
for update
using (
  bucket_id = 'market-images'
  and auth.uid() is not null
)
with check (
  bucket_id = 'market-images'
  and auth.uid() is not null
);

-- Authenticated users can delete images
drop policy if exists "authenticated delete market images" on storage.objects;
create policy "authenticated delete market images"
on storage.objects
for delete
using (
  bucket_id = 'market-images'
  and auth.uid() is not null
);

commit;
