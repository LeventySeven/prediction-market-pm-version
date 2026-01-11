-- Add image_url column to markets table for storing market images

begin;

alter table public.markets
  add column if not exists image_url text;

comment on column public.markets.image_url is 'URL of the market image (stored in Supabase storage)';

commit;
