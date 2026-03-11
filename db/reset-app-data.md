# Full App Data Reset

This reset clears all application data in Supabase except `public.users` and the `avatars` storage bucket.

It is meant for a full rebuild of market, social, analytics, and operational state while preserving user identities and avatar assets.

## What it preserves

- `public.users`
- `storage.objects` in the `avatars` bucket
- `auth.users` and other Supabase-managed auth records are untouched by this script

## What it clears

- `wallet_balances`
- `user_referrals`
- `market_comments`
- `market_comment_likes`
- `market_bookmarks`
- `market_context`
- `user_events`
- `trade_relay_audit`
- `api_rate_limits`
- `market_embeddings`
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
- every storage bucket except `avatars`

## Command

```bash
APP_RESET_CONFIRM=RESET_APP_EXCEPT_USERS bun --env-file .env scripts/supabase/reset-app-data.ts
```

## After the reset

1. Bump `UPSTASH_CACHE_NAMESPACE` in the environment before restart or deploy.
2. Restart the app.
3. Restart the collectors:

```bash
bun run collector:polymarket
bun run collector:limitless
```

4. Verify the rebuild:

```sql
select count(*) from public.users;
select provider, count(*) from public.market_catalog group by provider order by provider;
select provider, scope, last_success_at from public.provider_sync_state order by provider, scope;
```
