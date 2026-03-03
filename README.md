<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/12KufRUK6L1wyfEan2h_UqcYEitKuU_OS

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase DB context + schema/types

We keep a single copy‑pasteable “database context” file, generated from the live Supabase DB:
- `supabase/DB_CONTEXT.md`

And we keep the working TypeScript DB schema used by the app (frontend + backend) here:
- `src/types/database.ts`

To refresh `DB_CONTEXT.md` from your Supabase project (uses `.env`):

```bash
bun --env-file .env scripts/supabase/pull-schema.ts
```

Or:

```bash
bun run supabase:schema
```

To refresh `DB_CONTEXT.md` from a full SQL schema dump via Supabase CLI (`supabase db dump`):

```bash
bun run supabase:context:cli
```

For CI (fail if SQL dump is unavailable, do not fallback to OpenAPI):

```bash
bun run supabase:context:ci
```

Notes:
- This command derives the project ref from `NEXT_PUBLIC_SUPABASE_URL`.
- If `SUPABASE_DB_PASSWORD` is set, the script builds the DB URL automatically.
- If password is not set, it falls back to the linked/authenticated Supabase CLI project (`supabase login` + `supabase link`).
- If CLI dump fails (for example Docker/auth issues), it automatically falls back to REST OpenAPI introspection when `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are set.
- For CI/non-interactive environments, you can still set `SUPABASE_DB_URL` explicitly.

Then validate that `src/types/database.ts` still matches the live schema resource set:

```bash
bun run supabase:schema:check
```

## Realtime Collector (Railway/Bun)

This repo now includes a market data collector worker:

```bash
bun run collector:polymarket
```

And a Limitless collector worker (feature-flagged by `ENABLE_LIMITLESS=true`):

```bash
bun run collector:limitless
```

It performs:
- snapshot reconciliation from Polymarket REST,
- websocket ingestion from RTDS,
- batched upserts to `polymarket_market_live` and `polymarket_candles_1m`,
- mirror cache sync safety updates.

## Upstash Redis (Cache + Stream)

This repo supports Upstash as a Phase-2 acceleration layer for:
- cached market list/detail/trades reads (short TTL cache-aside),
- optional SSE market-live stream (`/api/stream/markets`),
- hot activity bootstrap from Redis for faster market open.

### 1. Create Upstash Redis

1. Create a Redis database in Upstash.
2. Open your database dashboard and copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### 2. Configure env (root `.env`)

Use `.env.example` as source of truth. Add these keys to the root `.env` file:

```bash
ENABLE_UPSTASH_CACHE=true
ENABLE_UPSTASH_STREAM=true
NEXT_PUBLIC_ENABLE_UPSTASH_STREAM=true

UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

UPSTASH_MARKETS_LIST_TTL_SEC=3
UPSTASH_MARKET_DETAIL_TTL_SEC=7
UPSTASH_MARKET_TRADES_TTL_SEC=3

UPSTASH_LIVE_STATE_TTL_SEC=20
UPSTASH_ACTIVITY_TTL_SEC=120
UPSTASH_ACTIVITY_MAX_ITEMS=200

UPSTASH_STREAM_POLL_INTERVAL_MS=1000
UPSTASH_STREAM_HEARTBEAT_MS=15000
```

### 3. Run app + collector

```bash
bun run dev
bun run collector:polymarket
```

Collector writes market live/activity snapshots into Upstash while continuing to write Supabase as source of truth.

### 4. Quick checks

1. Market list/detail/trades endpoints should become cache-backed automatically.
2. Stream endpoint should respond:

```bash
curl -N \"http://localhost:3000/api/stream/markets?ids=<market_id>\"
```

3. Health endpoint still works:

```bash
curl \"http://localhost:3000/api/health\"
```
