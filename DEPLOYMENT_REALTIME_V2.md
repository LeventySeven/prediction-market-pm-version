# Realtime-First Deployment Guide v2 (Step-by-Step)

This is a full runbook to deploy the current architecture:
- Next.js + tRPC app on Vercel
- Supabase (Postgres + Realtime + pgvector)
- Polymarket collector worker on Railway (Bun)

Trade flow remains non-custodial:
- order signing on client (Privy wallet)
- relay only on backend (`relaySignedOrder`)

## Deployment Order (Important)

Deploy in this exact order:
1. Configure environment variables.
2. Apply Supabase migration.
3. Deploy web app on Vercel.
4. Deploy collector worker on Railway.
5. Run smoke tests.

## 1. Prerequisites

You need:
1. Supabase project (production-ready plan recommended for Realtime load)
2. Vercel project connected to this repo
3. Railway project for collector worker
4. Privy app (for auth + embedded wallet)
5. Local tools:
   - Node `>=20`
   - Bun `>=1.1`
   - Supabase CLI (logged in)

Quick local checks:

```bash
node -v
bun -v
supabase -v
supabase login
```

## 2. Get Code and Install Dependencies

From repo root:

```bash
bun install
```

## 3. Configure Environment Variables

Create local env file first:

```bash
cp .env.example .env
```

Fill required values in `.env`, then copy the same values to Vercel/Railway (platform-specific list below).

### 3.1 Required Variables (Core)

Set these for production:
- `NEXT_PUBLIC_APP_URL` (your public app URL, e.g. `https://your-app.vercel.app`)
- `APP_URL` (same as above)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `AUTH_JWT_SECRET` (long random secret)
- `POLYMARKET_SYNC_SECRET` (used by `/api/cron/polymarket-sync`)
- `NEXT_PUBLIC_PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `NEXT_PUBLIC_POLYMARKET_CLOB_URL` (default: `https://clob.polymarket.com`)
- `NEXT_PUBLIC_POLYMARKET_CHAIN_ID` (default: `137`)
- `POLYMARKET_RTDS_WS_URL` (default: `wss://ws-live-data.polymarket.com`)

### 3.2 Collector Variables (Railway)

Required on Railway:
- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `POLYMARKET_RTDS_WS_URL`
- `COLLECTOR_FLUSH_INTERVAL_MS` (default `700`)
- `COLLECTOR_RECONCILE_INTERVAL_MS` (default `120000`)
- `COLLECTOR_HEARTBEAT_TIMEOUT_MS` (default `45000`)
- `COLLECTOR_HEALTH_PORT` (default `8080`)

Optional hardening:
- `COLLECTOR_RECONNECT_JITTER_MS` (default `700`)
- `COLLECTOR_DEAD_LETTER_LOG_EVERY_MS` (default `5000`)

### 3.3 Optional but Recommended

- `OPENAI_API_KEY`
- `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`)

## 4. Local Preflight Checks

Run these before touching production:

```bash
bunx tsc --noEmit
bun run build
```

Note:
- `bun run lint` may be interactive in this repo until ESLint migration is completed.

## 5. Apply Supabase Migration

Required migration:
- `supabase/migrations/20260302000100_realtime_first_architecture_v2.sql`

Run:

```bash
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

If you use separate projects (staging/prod), run this once per project.

### 5.1 If `supabase db push` asks for `--include-all`

You may see:
- `Found local migration files to be inserted before the last migration on remote database`
- and a list of `*_remote_history_placeholder.sql` files.

In this repo, those placeholder files are no-op comments used to align migration history.

Run:

```bash
supabase db push --include-all
```

Then run once more:

```bash
supabase db push
```

Expected:
- second command should report no pending migrations (or only truly new ones).

Safety checks before applying:
1. Confirm you linked the correct Supabase project (`supabase link --project-ref ...`).
2. Run `supabase migration list` to review local vs remote status.

## 6. Verify Supabase Setup (SQL Editor)

Run this in Supabase SQL Editor:

```sql
-- pgvector installed
select extname from pg_extension where extname = 'vector';

-- realtime publication includes live/candle tables
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('polymarket_market_live', 'polymarket_candles_1m', 'polymarket_market_cache');

-- tables exist
select to_regclass('public.polymarket_market_live') as live_table;
select to_regclass('public.polymarket_candles_1m') as candles_table;
select to_regclass('public.user_events') as events_table;
select to_regclass('public.market_embeddings') as embeddings_table;
```

Expected:
1. `vector` exists.
2. realtime publication contains at least `polymarket_market_live` and `polymarket_candles_1m`.
3. all four tables resolve (not null).

## 7. Deploy Web App (Vercel)

### 7.1 Project Setup

1. Import this repo into Vercel.
2. Keep root directory at repo root.
3. Use default Next.js build (`next build`).

### 7.2 Add Environment Variables (Vercel)

Add all core app variables from section 3.1 to:
1. Production
2. Preview (optional but recommended)

Security rules:
1. Never expose `SUPABASE_SERVICE_ROLE_KEY` as `NEXT_PUBLIC_*`.
2. Keep `PRIVY_APP_SECRET` server-side only.

### 7.3 Deploy

1. Deploy `main` (or your production branch).
2. Confirm successful build in Vercel logs.

### 7.4 Web Post-Deploy Checks

Verify:
1. `/catalog` loads markets.
2. Market detail page loads candles/trades/comments.
3. Search works (`market.searchSemantic`).
4. Trade flow still uses `checkTradeAccess` and `relaySignedOrder`.

## 8. Deploy Collector Worker (Railway)

Create a separate Railway service from the same repo.

### 8.1 Service Configuration

1. Runtime: Bun
2. Start command:

```bash
bun run collector:polymarket
```

3. Set instance count to `1` (single-writer mode).

### 8.2 Environment Variables

Add required collector vars from section 3.2.

### 8.3 Health Checks

Collector exposes:
- `/health` (liveness)
- `/ready` (readiness)

Recommended:
1. Configure Railway health check path to `/ready`.
2. Use `COLLECTOR_HEALTH_PORT=8080` (or your chosen internal port).

### 8.4 Collector Startup Validation

In Railway logs, confirm:
1. collector starts without env errors
2. websocket connects
3. snapshot sync runs
4. periodic upserts occur

## 9. Production Smoke Test (End-to-End)

Run after both Vercel and Railway are live.

### 9.1 UI Realtime Check

1. Open app in two browser sessions.
2. Open same market in both.
3. Confirm live market values/candles update without manual refresh.
4. Disconnect/reconnect one client and ensure it resyncs.

### 9.2 API/Feed Check

1. Open app and browse markets.
2. Confirm for-you feed loads ranked items.
3. Trigger interactions and ensure no auth/trpc errors in browser console.

### 9.3 DB Activity Check

Run:

```sql
select count(*) as live_rows from polymarket_market_live;
select count(*) as candles_last_hour from polymarket_candles_1m where bucket_start > now() - interval '1 hour';
select count(*) as events_last_10m from user_events where created_at > now() - interval '10 minutes';
```

Expected:
1. `live_rows > 0`
2. `candles_last_hour` grows over time while collector is running
3. `events_last_10m` grows when users interact

## 10. Operational Checklist (After Go-Live)

Daily checks:
1. Railway collector is healthy (`/ready` returns `200`).
2. `polymarket_market_live.updated_at` is fresh (not stale for long periods).
3. Vercel app has no spike in 5xx/trpc errors.
4. No sensitive payloads are printed in logs.

## 11. Troubleshooting

### Collector not writing rows

Check:
1. `SUPABASE_SERVICE_ROLE_KEY` is set correctly on Railway.
2. `POLYMARKET_RTDS_WS_URL` reachable from Railway.
3. collector logs for `[collector] live upsert failed`.

### Realtime not updating in UI

Check:
1. migration applied successfully
2. `supabase_realtime` publication includes live/candle tables
3. frontend has correct `NEXT_PUBLIC_SUPABASE_URL` + anon key

### App deploy succeeds but trading fails

Check:
1. `NEXT_PUBLIC_PRIVY_APP_ID` and `PRIVY_APP_SECRET`
2. `NEXT_PUBLIC_POLYMARKET_CLOB_URL`
3. region access checks (`checkTradeAccess`) and relay errors in logs

## 12. Rollback Plan

If realtime path degrades:
1. Stop Railway collector service.
2. Keep web app running (existing fallback paths continue serving core views).
3. Fix collector issue and redeploy worker.
4. Confirm live/candle tables resume updates.

If web deploy introduces regression:
1. Roll Vercel deployment back to previous stable release.
2. Keep current DB schema (no destructive rollback required for this migration).
3. Re-test smoke checklist before re-enabling full traffic.
