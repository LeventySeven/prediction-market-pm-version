begin;

alter table if exists public.users
  add column if not exists profile_description text null,
  add column if not exists avatar_palette jsonb null,
  add column if not exists profile_setup_completed_at timestamptz null;

update public.users
set profile_setup_completed_at = now()
where profile_setup_completed_at is null
  and (
    coalesce(auth_provider, 'legacy') <> 'privy'
    or (
      display_name is not null
      and length(trim(display_name)) >= 2
      and email !~* '@privy\\.local$'
    )
  );

commit;
