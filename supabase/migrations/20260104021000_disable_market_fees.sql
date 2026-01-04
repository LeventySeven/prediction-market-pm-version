-- Disable all market fees/commissions for now.
-- This makes sure existing markets and new markets both have fee_bps = 0.

alter table public.markets
  alter column fee_bps set default 0;

update public.markets
  set fee_bps = 0
where fee_bps is distinct from 0;


