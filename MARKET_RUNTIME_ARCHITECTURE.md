# Market Runtime Architecture (Source of Truth)

Last updated: 2026-03-05  
Scope: Current implementation in this repository (frontend + API + workers + data pipeline).

This document defines the **correct approach** for market data loading, realtime updates, caching, workers, and operational fallback behavior.

## 1) Goals and Non-Negotiables

1. Market pages and catalog must feel instant after warm-up.
2. Price/volume/chart data must stay fresh with graceful fallback.
3. UI should animate value changes, not blink/repaint entire lists repeatedly.
4. Upstash is an acceleration layer, not a hard dependency.
5. Supabase remains the durable source of truth for ingestion state and canonical market data.
6. Categories shown in the top filter must come from markets currently loaded in the app (no empty categories).

## 2) High-Level System

```mermaid
flowchart LR
  PM[Polymarket APIs + WS] --> PWC[Polymarket Collector]
  LM[Limitless APIs + WS/poll] --> LWC[Limitless Collector]
  PWC --> SB[(Supabase)]
  LWC --> SB
  PWC --> UP[(Upstash Redis)]
  LWC --> UP
  FE[Next.js Frontend] --> TRPC[tRPC Market Router]
  TRPC --> SB
  TRPC --> UP
  FE --> SSE[/api/stream/markets]
  SSE --> UP
  FE --> SBR[Supabase Realtime fallback]
  SBR --> SB
```

## 3) Data Responsibilities

## 3.1 Supabase (durable, canonical, fallback)

Primary responsibilities:
1. Canonical catalog and outcomes:
   - `market_catalog`
   - `market_outcomes`
2. Canonical realtime:
   - `market_live`
   - `market_candles_1m`
3. Polymarket raw/replayable feeds:
   - `polymarket_market_live`
   - `polymarket_candles_1m`
   - `polymarket_market_ticks`
   - `polymarket_market_cache`
4. Worker state and ops:
   - `provider_sync_state`
5. Product/social/auth:
   - users, comments, bookmarks, etc.

Supabase is the fallback path whenever Upstash is absent/unhealthy.

## 3.2 Upstash (hot cache + stream acceleration)

Primary responsibilities:
1. Short-TTL cache-aside reads:
   - market list
   - market detail
   - market trades
2. Hot realtime patch state (`realtime:market:live:*`)
3. Hot recent activity list (`realtime:market:activity:*`)
4. SSE source for `/api/stream/markets` when enabled.

Upstash can be disabled or unconfigured; system remains functional via Supabase.

## 4) Frontend Market Loading (Current Correct Flow)

Key file: `app/page.tsx`

## 4.1 Catalog route and prefetch

1. Canonical catalog route is `/catalog` (provider paths supported).
2. Client maintains in-memory page cache keyed by:
   - provider
   - page
   - backend sort mode
3. Warm bootstrap cache is persisted in `localStorage` (short TTL) and reused on revisit/hard reload.
4. Balanced prefetch:
   - page 1 for enabled providers
   - page 2 for active provider
4. In-flight dedupe prevents duplicate network requests for same page key.

## 4.2 No-blink behavior

1. If cache exists or current markets already exist, UI keeps current list visible while refreshing.
2. Failed refresh no longer clears existing markets.
3. Realtime channel/SSE failures no longer force full catalog reload loops.
4. Live patch map is pruned only for markets no longer present; not fully reset every refresh.
5. Empty state is only shown after the active provider/page key finishes at least one fetch cycle.

## 4.3 Provider tabs and request safety

1. Provider chips are built from `market.listEnabledProviders` only.
2. Disabled providers are hidden from tabs.
3. URL on disabled provider auto-falls back to `/catalog`.
4. `loadMarkets` uses request-sequence guards so stale responses cannot overwrite newer tab/page requests.

## 4.4 Search behavior

1. Search input drives semantic search and lexical matching.
2. Missing semantic results are hydrated once per query via a dedupe set.
3. Pagination resets to page 1 when search/category changes to avoid empty-page flicker.

## 4.5 Categories behavior

1. Category chips are derived from `markets` currently loaded in frontend state.
2. Provider-aware filtering is applied before category derivation.
3. If active category disappears after data/provider change, it resets to `all`.
4. Result: no empty categories shown to user.

## 4.6 Realtime price/volume updates in catalog

1. Visible market IDs are tracked.
2. Realtime patches are consumed via:
   - Upstash SSE (`/api/stream/markets`) when enabled
   - Supabase realtime fallback otherwise
3. Patches are batched and applied only on material numeric change.
4. Patch normalization merges with prior patch state, so null partial payloads do not erase valid rolling volume.
5. Display volume uses `max(baseVolume, rolling24hVolume)` and should not regress to zero when valid prior data exists.

## 4.7 Stable catalog ordering + highlights

1. Catalog order is locked per context key (`provider/page/sort/status/time/category/search`).
2. Existing IDs keep prior on-screen order across live updates.
3. New IDs insert at sorted slot and shift only where inserted.
4. Highlight states:
   - `new`: 4s bright pink outline/glow
   - `updated`: 2s darker pink outline/glow

## 5) Market Detail Loading

## 5.1 Candles

1. Default interval: `1h`
2. Optional interval: `1m`
3. API: `market.getPriceCandles({ marketId, provider, interval, limit })`
4. Frontend only subscribes to 1m candle realtime rows for `1m` interval mode.
5. Chart series updates are incremental to preserve smooth animation and avoid full chart reset.

## 5.2 Trades and activity

1. `market.getLiveActivity`:
   - Upstash activity list first
   - Supabase ticks fallback
2. `market.getPublicTrades`:
   - Upstash cache first
   - Upstash activity / local ticks when worker fresh
   - Provider API fallback if needed

## 5.3 Profile setup reliability

Profile completion submit path includes:
1. CSRF invalid retry (refresh CSRF cookie, retry once)
2. Recovery check via `auth.me` (`refreshUser`) so transient backend success does not show false “Failed to save profile”.

## 6) Backend Market Router Strategy

Key file: `src/server/trpc/routers/market.ts`

## 6.1 listMarkets

1. Parse provider selection (`all` / single provider).
2. Check worker freshness for selected providers.
3. If workers are fresh:
   - attempt Upstash list cache hit
4. Load provider rows:
   - Polymarket: mirror-first + live fallback + merge with `polymarket_market_live`
   - Limitless: canonical (`market_catalog` + `market_live`) first if fresh; adapter fallback otherwise
5. Dedupe by canonical market ID.
6. Sort by requested mode (`newest`/`volume`) with stable tie-breakers.
7. Store list in Upstash with short TTL when workers are fresh.

## 6.2 getMarket

1. Provider-aware market ID normalization.
2. Upstash detail cache checked if provider worker is fresh.
3. Polymarket:
   - mirror/live resolve
   - merge with live snapshot
4. Limitless:
   - canonical row when fresh
   - adapter fallback otherwise
5. Cache result in Upstash.

## 6.3 getPriceCandles

Fallback chain:
1. Canonical candles (`market_candles_1m`) normalized to requested interval
2. Provider-local candle tables (for polymarket path)
3. Provider history adapter/API
4. Non-empty baseline candles from current outcome price

Rules:
1. Interval-aware normalization (`1m` or `1h`) is explicit.
2. Multi-outcome charts do not rely only on `__market__`; baseline fallback prevents empty chart area.
3. Return never intentionally leaves chart block blank.

## 7) Realtime Stream API

Key file: `app/api/stream/markets/route.ts`

1. Enabled only when Upstash stream mode is enabled.
2. Accepts up to 80 market IDs.
3. Polls Upstash live patch keys at configured interval.
4. Sends:
   - `ready` event once
   - `live` events for initial and changed snapshots (fingerprint dedupe)
   - heartbeat comments for keepalive
5. If unavailable, frontend falls back to Supabase realtime channel path.

## 8) Workers: What They Do

## 8.1 Polymarket collector

Key file: `scripts/collector/polymarket-collector.ts`

Responsibilities:
1. Ingest live market feed from Polymarket websocket.
2. Reconcile snapshots periodically from REST.
3. Maintain dedupe and stale-update guards.
4. Build/roll 1-minute candles.
5. Upsert to Supabase:
   - `polymarket_market_live`
   - `polymarket_candles_1m`
   - `polymarket_market_ticks`
6. Write hot patches/ticks to Upstash:
   - live patch keys
   - activity lists
7. Optional canonical mirror write:
   - `market_live`
   - `market_candles_1m`
8. Update `provider_sync_state` start/success/error timestamps and messages.

## 8.2 Limitless collector

Key file: `scripts/collector/limitless-collector.ts`

Responsibilities:
1. Snapshot sync (`head` and `full` modes), optional ws path, poll fallback.
2. Normalize provider market IDs to canonical IDs via `market_catalog`.
3. Upsert canonical realtime:
   - `market_live`
   - `market_candles_1m`
4. Write Upstash live patches using canonical market IDs.
5. Keep catalog fresh via `upsertVenueMarketsToCatalog`.
6. Update `provider_sync_state` consistently.

Operational requirement:
1. For instant all-venues catalog behavior, run both collectors continuously.

## 9) Health, Diagnostics, and Degraded Mode

## 9.1 Health endpoint

Key file: `app/api/health/route.ts`

Returns:
1. aggregated realtime metrics
2. pipeline status (`healthy` / `degraded`)
3. provider sync state rows
4. live/candle freshness heads
5. Upstash configuration and ping status

## 9.2 Ops script

Key file: `scripts/ops/check-realtime-health.ts`

Command:
```bash
bun run ops:check-realtime-health
```

Use it as first-line smoke check for:
1. ingestion freshness
2. provider sync state validity
3. Upstash availability and fallback mode

## 9.3 Degraded-but-functional policy

System is still considered functional when:
1. Upstash is disabled/unconfigured/unreachable
2. Supabase ingestion and canonical reads are working
3. Frontend can continue via Supabase realtime and polling fallback

## 10) Why This Is Fast (and Stable)

Speed comes from layered optimizations:
1. Client-side page cache + prefetch + in-flight dedupe
2. Upstash short-TTL cache for list/detail/trades
3. Upstash hot realtime patches to avoid heavy DB reads per frame
4. Material-change filtering before state updates
5. Batched patch application (fewer React commits)
6. Visible-market subscription strategy (not all markets at once)
7. Worker batching + chunked upserts
8. Fallback-first design (no single point of failure between Upstash and Supabase)

Stability comes from:
1. Provider sync freshness tracking
2. Snapshot reconcile loops in workers
3. Non-empty candle baseline fallback
4. ID normalization across providers
5. Retry and recovery for auth/profile setup edge cases

## 11) Golden Rules for Future Changes

1. Do not make Upstash mandatory for correctness.
2. Do not clear market lists on transient refresh/stream errors.
3. Keep category chips market-backed (no static/empty categories).
4. Keep candle interval explicit (`1h` default, `1m` optional realtime).
5. Preserve provider-aware canonical IDs everywhere.
6. Any new realtime path must include:
   - freshness signal
   - dedupe logic
   - fallback path
7. Update this file whenever market-loading architecture changes.
