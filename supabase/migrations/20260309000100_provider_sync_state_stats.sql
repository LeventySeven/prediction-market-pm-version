alter table public.provider_sync_state
  add column if not exists stats jsonb null;
