# Market Data Reset

This reset clears market data for both providers and preserves user-generated tables such as `users`, `market_comments`, `market_bookmarks`, `market_context`, and profile data.

## What it clears

- `market_catalog`
- `market_outcomes`
- `market_live`
- `market_candles_1m`
- `provider_sync_state`
- `polymarket_market_cache`
- `polymarket_market_live`
- `polymarket_candles_1m`
- `polymarket_market_ticks`
- `polymarket_sync_state`

## Command

```bash
MARKET_RESET_CONFIRM=RESET_MARKETS bun --env-file .env scripts/supabase/reset-market-data.ts
```

## Repopulation

Run the collectors after the reset:

```bash
bun run collector:polymarket
bun run collector:limitless
```

Then verify:

```sql
select provider, count(*) from public.market_catalog group by provider order by provider;
select provider, scope, last_success_at from public.provider_sync_state order by provider, scope;
```
