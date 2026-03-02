# Supabase DB Context (public)

Generated at: `2026-03-02T11:27:23.042Z`
Linked Project Ref: `lumqdmcoeyosimpszrrn`
Source: `Supabase REST OpenAPI fallback (CLI requires Docker)`
Schema dump file: `supabase/.temp/public_schema.dump.sql`

## Summary
- Extensions: **0**
- Enums: **0**
- Tables: **13**
- Views: **0**
- Materialized views: **0**
- Functions: **0**

## Tables
### `market_bookmarks`
- Columns: **3**
- `created_at`: `string(timestamp with time zone)` — NOT NULL
- `market_id`: `string(text)` — NOT NULL
- `user_id`: `string(uuid)` — NOT NULL

### `market_comment_likes`
- Columns: **3**
- `comment_id`: `string(uuid)` — NOT NULL
- `created_at`: `string(timestamp with time zone)` — NOT NULL
- `user_id`: `string(uuid)` — NOT NULL

### `market_comments`
- Columns: **6**
- `body`: `string(text)` — NOT NULL
- `created_at`: `string(timestamp with time zone)` — NOT NULL
- `id`: `string(uuid)` — NOT NULL
- `market_id`: `string(text)` — NOT NULL
- `parent_id`: `string(uuid)`
- `user_id`: `string(uuid)` — NOT NULL

### `market_context`
- Columns: **4**
- `context`: `string(text)` — NOT NULL
- `market_id`: `string(text)` — NOT NULL
- `sources`: `unknown(jsonb)` — NOT NULL
- `updated_at`: `string(timestamp with time zone)` — NOT NULL

### `market_embeddings`
- Columns: **4**
- `embedding`: `string(public.vector(1536))` — NOT NULL
- `market_id`: `string(text)` — NOT NULL
- `model`: `string(text)` — NOT NULL
- `updated_at`: `string(timestamp with time zone)` — NOT NULL

### `polymarket_candles_1m`
- Columns: **10**
- `bucket_start`: `string(timestamp with time zone)` — NOT NULL
- `close`: `number(numeric)` — NOT NULL
- `high`: `number(numeric)` — NOT NULL
- `low`: `number(numeric)` — NOT NULL
- `market_id`: `string(text)` — NOT NULL
- `open`: `number(numeric)` — NOT NULL
- `source_ts_max`: `string(timestamp with time zone)`
- `trades_count`: `integer(integer)` — NOT NULL
- `updated_at`: `string(timestamp with time zone)` — NOT NULL
- `volume`: `number(numeric)` — NOT NULL

### `polymarket_market_cache`
- Columns: **19**
- `category`: `string(text)`
- `clob_token_ids`: `unknown(jsonb)` — NOT NULL
- `closes_at`: `string(timestamp with time zone)` — NOT NULL
- `condition_id`: `string(text)` — NOT NULL
- `description`: `string(text)`
- `expires_at`: `string(timestamp with time zone)` — NOT NULL
- `image_url`: `string(text)`
- `last_synced_at`: `string(timestamp with time zone)` — NOT NULL
- `market_created_at`: `string(timestamp with time zone)` — NOT NULL
- `market_id`: `string(text)` — NOT NULL
- `outcomes`: `unknown(jsonb)` — NOT NULL
- `resolved_outcome_title`: `string(text)`
- `search_text`: `string(text)` — NOT NULL
- `slug`: `string(text)` — NOT NULL
- `source_updated_at`: `string(timestamp with time zone)` — NOT NULL
- `source_url`: `string(text)`
- `state`: `string(text)` — NOT NULL
- `title`: `string(text)` — NOT NULL
- `volume`: `number(numeric)` — NOT NULL

### `polymarket_market_live`
- Columns: **12**
- `best_ask`: `number(numeric)` — NOT NULL
- `best_bid`: `number(numeric)` — NOT NULL
- `ingested_at`: `string(timestamp with time zone)` — NOT NULL
- `last_trade_price`: `number(numeric)` — NOT NULL
- `last_trade_size`: `number(numeric)` — NOT NULL
- `market_id`: `string(text)` — NOT NULL
- `mid`: `number(numeric)` — NOT NULL
- `open_interest`: `number(numeric)`
- `rolling_24h_volume`: `number(numeric)` — NOT NULL
- `source_seq`: `integer(bigint)`
- `source_ts`: `string(timestamp with time zone)` — NOT NULL
- `updated_at`: `string(timestamp with time zone)` — NOT NULL

### `polymarket_sync_state`
- Columns: **5**
- `last_error`: `string(text)`
- `last_started_at`: `string(timestamp with time zone)`
- `last_success_at`: `string(timestamp with time zone)`
- `scope`: `string(text)` — NOT NULL
- `updated_at`: `string(timestamp with time zone)` — NOT NULL

### `user_events`
- Columns: **8**
- `created_at`: `string(timestamp with time zone)` — NOT NULL
- `event_type`: `string(text)` — NOT NULL
- `event_value`: `number(numeric)`
- `id`: `integer(bigint)` — NOT NULL
- `market_id`: `string(text)` — NOT NULL
- `metadata`: `unknown(jsonb)` — NOT NULL
- `session_id`: `string(text)` — NOT NULL
- `user_id`: `string(uuid)`

### `user_referrals`
- Columns: **4**
- `created_at`: `string(timestamp with time zone)` — NOT NULL
- `id`: `string(uuid)` — NOT NULL
- `referrer_user_id`: `string(uuid)` — NOT NULL
- `user_id`: `string(uuid)` — NOT NULL

### `users`
- Columns: **19**
- `auth_provider`: `string(text)` — NOT NULL
- `avatar_url`: `string(text)`
- `created_at`: `string(timestamp with time zone)` — NOT NULL
- `display_name`: `string(text)`
- `email`: `string(text)` — NOT NULL
- `id`: `string(uuid)` — NOT NULL
- `is_admin`: `boolean(boolean)` — NOT NULL
- `privy_user_id`: `string(text)`
- `privy_wallet_address`: `string(text)`
- `referral_code`: `string(text)`
- `referral_commission_rate`: `number(numeric)`
- `referral_enabled`: `boolean(boolean)`
- `telegram_auth_date`: `string(timestamp with time zone)`
- `telegram_first_name`: `string(text)`
- `telegram_id`: `integer(bigint)`
- `telegram_last_name`: `string(text)`
- `telegram_photo_url`: `string(text)`
- `telegram_username`: `string(text)`
- `username`: `string(text)` — NOT NULL

### `wallet_balances`
- Columns: **4**
- `asset_code`: `string(text)` — NOT NULL
- `balance_minor`: `integer(bigint)` — NOT NULL
- `updated_at`: `string(timestamp with time zone)` — NOT NULL
- `user_id`: `string(uuid)` — NOT NULL

## Views
(No views parsed)

## Materialized Views
(No materialized views parsed)

## Functions
(No functions parsed)

## Refresh
- Run: `bun run supabase:context:cli`
- Optional: set `SUPABASE_DB_URL` for non-interactive CI usage
- Optional: set `SUPABASE_SCHEMA_DUMP_FILE=path/to/schema.sql` to rebuild from an existing dump

