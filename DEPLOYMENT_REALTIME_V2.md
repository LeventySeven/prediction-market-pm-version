# Realtime-First Deployment Guide v2

This guide deploys the current architecture:
- Next.js + tRPC app on Vercel
- Supabase (Postgres + Realtime + pgvector)
- Polymarket collector worker on Railway (Bun)

It keeps trading non-custodial: client-side Privy signing + backend relay only.

## 1. Prerequisites

- Supabase project (Pro recommended for production Realtime load)
- Vercel project linked to this repo
- Railway project for background worker
- Bun `>=1.1`
- Node `>=20`
- Supabase CLI installed and authenticated

## 2. Pull Latest Code and Install

```bash
bun install
```

## 3. Configure Environment Variables

Copy `.env.example` and fill all required values.

Minimum required for production:
- `NEXT_PUBLIC_APP_URL`
- `APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_JWT_SECRET`
- `POLYMARKET_SYNC_SECRET`
- `NEXT_PUBLIC_PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `NEXT_PUBLIC_POLYMARKET_CLOB_URL`
- `NEXT_PUBLIC_POLYMARKET_CHAIN_ID`
- `POLYMARKET_RTDS_WS_URL`
- `COLLECTOR_FLUSH_INTERVAL_MS`
- `COLLECTOR_RECONCILE_INTERVAL_MS`
- `COLLECTOR_HEARTBEAT_TIMEOUT_MS`

Optional but recommended:
- `OPENAI_API_KEY`
- `OPENAI_EMBEDDING_MODEL`

## 4. Apply Supabase Migration

This release requires migration:
- `supabase/migrations/20260302000100_realtime_first_architecture_v2.sql`

Run:

```bash
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

## 5. Verify DB/Realtime Setup

Run in Supabase SQL editor:

```sql
select extname from pg_extension where extname = 'vector';

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('polymarket_market_live', 'polymarket_candles_1m', 'polymarket_market_cache');
```

Expected:
- `vector` extension present
- realtime publication includes the tables above

## 6. Run Fast Local Checks

Keep checks short and focused:

```bash
bunx tsc --noEmit
```

If you use lint in CI, run non-interactive lint there after ESLint initialization.

## 7. Deploy Web App (Vercel)

1. Add all app env vars in Vercel (Production + Preview as needed).
2. Ensure `SUPABASE_SERVICE_ROLE_KEY` is server-only.
3. Deploy main branch.

Post-deploy quick checks:
- `/catalog` loads markets
- market page loads comments/trades/candles
- semantic search endpoint responds
- placing order still goes through `relaySignedOrder`

## 8. Deploy Collector Worker (Railway)

Create a separate Railway service from this repo.

Service settings:
- Runtime: Bun
- Start command:

```bash
bun run collector:polymarket
```

Required Railway env vars:
- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `POLYMARKET_RTDS_WS_URL`
- `COLLECTOR_FLUSH_INTERVAL_MS`
- `COLLECTOR_RECONCILE_INTERVAL_MS`
- `COLLECTOR_HEARTBEAT_TIMEOUT_MS`

Scale recommendation:
- 1 instance (single-writer) for initial production

## 9. Production Smoke Test

1. Open app in two browser sessions.
2. Open same market in both.
3. Confirm live price/candle updates propagate without manual refresh.
4. Confirm feed endpoint returns ranked items.
5. Confirm `events.track` writes to `user_events`.

Useful SQL checks:

```sql
select count(*) from polymarket_market_live;
select count(*) from polymarket_candles_1m where bucket_start > now() - interval '1 hour';
select count(*) from user_events where created_at > now() - interval '10 minutes';
```

## 10. Security Checklist

- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to browser/client code.
- Keep `cache-control: no-store` on access/relay endpoints.
- Keep order payload/body size limits and rate limits enabled.
- Keep Privy signing client-side only.
- Avoid logging raw signed orders or private credentials.

## 11. Rollback Plan

If realtime path degrades:
1. Stop Railway collector service.
2. App continues with REST fallback paths for markets/candles.
3. Re-enable collector after fix and verify live table writes resume.
