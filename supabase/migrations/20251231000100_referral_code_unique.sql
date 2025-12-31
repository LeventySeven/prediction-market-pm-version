-- Ensure referral codes are unique (only when present).
-- This supports user-generated referral links safely.

begin;

create unique index if not exists users_referral_code_unique
  on public.users (referral_code)
  where referral_code is not null;

commit;


