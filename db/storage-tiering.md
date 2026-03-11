# Storage Tiering For Heavy Market Data

This project should stop treating Supabase Postgres as the default sink for dense append-only market history.

NIA-MCP guidance was consistent on the tradeoff:

- keep relational canonical state in Postgres
- keep only the hot moving window in Upstash
- move long-tail candle and tick history into worker-written object-storage chunks

References used during this pass:

- [Supabase Performance Tuning](https://supabase.com/docs/guides/platform/performance)
- [Supabase Analytics Buckets](https://supabase.com/blog/introducing-analytics-buckets)
- [Upstash Redis TimeSeries](https://upstash.com/blog/redis-timeseries)

## Recommended ownership

### Keep in Supabase Postgres

- `users`
- `market_catalog`
- `market_outcomes`
- `market_live`
- `provider_sync_state`
- `trade_relay_audit`
- `api_rate_limits`
- `market_context`
- `market_comments`
- `market_comment_likes`
- `market_bookmarks`

Reason:
these are canonical relational tables with small row counts relative to candles and ticks, and they benefit from SQL joins and transactional updates.

### Keep in Upstash only as a hot tier

- current live market patch per market
- recent public trade/activity feed per market
- recent candle head buffers that workers are still aggregating
- route/list/detail response caches

Reason:
Upstash is appropriate for short-retention, low-latency reads and write buffering, but it should not become the durable archive.

Suggested retention:

- live patches: `1-5` minutes
- recent trade/activity feed: `10-60` minutes
- in-progress candle buffers: until the worker flushes the chunk

### Move out of Supabase Postgres into object storage

- `market_candles_1m`
- `polymarket_candles_1m`
- `polymarket_market_ticks`
- large raw provider payload archives
- historical `user_events` if they are kept for analytics instead of product logic

Preferred shape:

- chunk by `provider/market_id/date/hour`
- store compressed `jsonl` now, move to `parquet` once the read path is stable
- write a small manifest per market/day so the API can find the right chunk quickly

Reason:
these datasets are append-only, high-volume, and the main source of WAL churn and disk I/O pressure in Postgres.

## Practical target architecture

1. Workers ingest raw provider events.
2. Workers update canonical market head tables in Supabase.
3. Workers write hot live patches and short-lived activity lists to Upstash.
4. Workers buffer raw ticks and minute candles in memory or Upstash.
5. Workers flush hourly chunks to object storage.
6. Chart reads use:
   - Upstash for the newest head window
   - object storage chunks for `1W`, `1M`, and `Y`
   - Supabase only for market metadata and the latest durable head state

## Table-specific decisions

### `market_candles_1m`

Short term:
- stop treating it as a forever table
- if it remains temporarily, cap retention aggressively and keep only the latest head window

Long term:
- replace it with worker-flushed hourly chunk files plus server-side downsampling

### `polymarket_market_ticks`

- remove from primary Postgres entirely
- keep only a short recent trade/activity window in Upstash
- archive raw ticks to object storage if replay or analytics are still needed

### `market_embeddings`

- keep in Supabase for now if there is only one embedding row per market
- move only if the corpus grows enough that vector indexing becomes a real storage or write concern

### `user_events`

- if the table is only for analytics, batch-export it to object storage and delete old rows on a schedule
- if it drives product features, keep the minimal recent subset in Postgres and archive the rest

## What not to do

- do not keep multi-month raw candle or tick history in Supabase tables
- do not rebuild missing history on user reads
- do not use Upstash as the only durable store for historical charts
- do not keep provider payload blobs as the primary query path when first-class canonical columns are enough
