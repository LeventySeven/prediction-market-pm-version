begin;

-- Switch minor-unit columns to numeric so we are not limited by bigint/int ranges.

alter table wallet_balances
  alter column balance_minor type numeric(30, 0)
  using balance_minor::numeric;

alter table wallet_transactions
  alter column amount_minor type numeric(30, 0)
  using amount_minor::numeric;

alter table market_amm_state
  alter column fee_accumulated_minor type numeric(30, 0)
  using fee_accumulated_minor::numeric;

alter table market_price_candles
  alter column volume_minor type numeric(30, 0)
  using volume_minor::numeric;

alter table trades
  alter column collateral_gross_minor type numeric(30, 0)
  using collateral_gross_minor::numeric,
  alter column collateral_net_minor type numeric(30, 0)
  using collateral_net_minor::numeric,
  alter column fee_minor type numeric(30, 0)
  using fee_minor::numeric,
  alter column shares_delta type numeric(30, 12)
  using shares_delta::numeric;

commit;

