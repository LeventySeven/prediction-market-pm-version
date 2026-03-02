# Realtime + Multi-Venue Deployment Guide v2

Last updated: 2026-03-02

This runbook deploys the current production architecture:
- Next.js + tRPC app on Vercel
- Supabase Postgres + Realtime
- Polymarket collector worker (required)
- Limitless collector worker (optional, feature-flagged)

The platform remains non-custodial:
- order signing stays client-side
- backend only performs access checks and relay of already signed payloads
- no private keys or raw signed order bodies are persisted

## 1. Deployment Order (Do Not Reorder)

1. Set environment variables for each runtime.
2. Run local preflight (`tsc` + `build`).
3. Apply Supabase migrations.
4. Verify schema, RLS, realtime publication, and backfill state.
5. Deploy web app on Vercel.
6. Deploy `collector:polymarket` worker.
7. Optionally deploy `collector:limitless` worker behind feature flag.
8. Run smoke tests and security checks.

## 2. Prerequisites

You need:
1. Supabase project and access to SQL editor.
2. Vercel project connected to this repo.
3. Railway (or equivalent worker runtime) for collectors.
4. Privy app for auth/wallet.
5. Local tooling:
   - Node `>=20`
   - Bun `>=1.1`
   - Supabase CLI (authenticated)

Local tool check:

```bash
node -v
bun -v
supabase -v
supabase login
```

Install dependencies:

```bash
bun install
```

## 3. Environment Variables

Create local env:

```bash
cp .env.example .env
```

Use the same values across environments where applicable.

### 3.1 Web App (Vercel) Required

Set these in Vercel Production (and Preview if needed):
- `NEXT_PUBLIC_APP_URL`
- `APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_JWT_SECRET`
- `NEXT_PUBLIC_PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `POLYMARKET_SYNC_SECRET` (or use `CRON_SECRET`)
- `TRUST_PROXY_HEADERS=true`

Recommended explicit values (to avoid implicit defaults):
- `POLYMARKET_API_BASE_URL=https://gamma-api.polymarket.com`
- `POLYMARKET_CLOB_API_BASE_URL=https://clob.polymarket.com`
- `POLYMARKET_DATA_API_BASE_URL=https://data-api.polymarket.com`
- `NEXT_PUBLIC_POLYMARKET_CLOB_URL=https://clob.polymarket.com`
- `NEXT_PUBLIC_POLYMARKET_CHAIN_ID=137`
- `POLYMARKET_ACCESS_STATUS_TTL_MS=60000`
- `POLYMARKET_RELAY_TIMEOUT_MS=10000`

Limitless read/trade configuration (only if enabling Limitless):
- `ENABLE_LIMITLESS=true`
- `LIMITLESS_API_BASE_URL=https://api.limitless.exchange/api/v1`
- `LIMITLESS_CHAIN_ID=8453`
- `LIMITLESS_ACCESS_STATUS_URL=<provider access-status endpoint>`
- `LIMITLESS_ORDER_RELAY_URL=<provider order relay endpoint>`
- `LIMITLESS_ACCESS_STATUS_TTL_MS=60000`
- `LIMITLESS_RELAY_TIMEOUT_MS=10000`

### 3.2 Polymarket Collector Worker Required

Set these in the worker service that runs `bun run collector:polymarket`:
- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `POLYMARKET_RTDS_WS_URL=wss://ws-live-data.polymarket.com`
- `COLLECTOR_FLUSH_INTERVAL_MS=700`
- `COLLECTOR_RECONCILE_INTERVAL_MS=120000`
- `COLLECTOR_HEARTBEAT_TIMEOUT_MS=45000`
- `COLLECTOR_HEARTBEAT_CLOSE_MULTIPLIER=4`
- `COLLECTOR_RECONNECT_JITTER_MS=700`
- `COLLECTOR_DEAD_LETTER_LOG_EVERY_MS=5000`
- `COLLECTOR_SNAPSHOT_PAGE_SIZE=150`
- `COLLECTOR_SNAPSHOT_MAX_PAGES=6`
- `COLLECTOR_UPSERT_CHUNK_SIZE=400`
- `COLLECTOR_CANDLE_UPSERT_CHUNK_SIZE=400`
- `COLLECTOR_HEALTH_PORT=8080`

### 3.3 Limitless Collector Worker Optional

Set these in the worker service that runs `bun run collector:limitless`:
- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENABLE_LIMITLESS=true`
- `LIMITLESS_API_BASE_URL`
- `LIMITLESS_RTDS_WS_URL` (optional; collector falls back to polling when absent)
- `LIMITLESS_COLLECTOR_POLL_INTERVAL_MS=15000`
- `LIMITLESS_COLLECTOR_FLUSH_INTERVAL_MS=700`
- `LIMITLESS_COLLECTOR_RECONCILE_INTERVAL_MS=120000`
- `LIMITLESS_COLLECTOR_HEALTH_PORT=8081`

## 4. Local Preflight

Run before pushing deployment changes:

```bash
bunx tsc --noEmit
bun run build
```

Optional but recommended DB context CI parity check:

```bash
bun run supabase:context:ci
bun run supabase:schema:check
```

Note: `bun run lint` is currently interactive in this repo until ESLint migration is completed.

## 5. Apply Supabase Migrations

This rollout requires these migrations at minimum:
- `20260302000100_realtime_first_architecture_v2.sql`
- `20260302000200_multi_venue_canonical_v1.sql`

Apply:

```bash
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

If prompted due placeholder ordering, run:

```bash
supabase db push --include-all
supabase db push
```

## 6. Verify Database State (Supabase SQL Editor)

Run this verification block:

```sql
-- Core canonical tables
select to_regclass('public.market_catalog') as market_catalog;
select to_regclass('public.market_outcomes') as market_outcomes;
select to_regclass('public.market_live') as market_live;
select to_regclass('public.market_candles_1m') as market_candles_1m;
select to_regclass('public.provider_sync_state') as provider_sync_state;
select to_regclass('public.trade_relay_audit') as trade_relay_audit;
select to_regclass('public.api_rate_limits') as api_rate_limits;

-- Realtime publication should include canonical realtime tables
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('market_live', 'market_candles_1m', 'polymarket_market_live', 'polymarket_candles_1m')
order by tablename;

-- RLS enabled check
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'market_catalog',
    'market_outcomes',
    'market_live',
    'market_candles_1m',
    'provider_sync_state',
    'trade_relay_audit',
    'api_rate_limits'
  )
order by c.relname;

-- Durable rate limit function exists
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'consume_rate_limit';

-- Backfill sanity: canonical polymarket rows should be present
select
  (select count(*) from public.polymarket_market_cache) as legacy_polymarket_cache,
  (select count(*) from public.market_catalog where provider = 'polymarket') as canonical_polymarket_catalog,
  (select count(*) from public.market_live) as canonical_live_rows;
```

## 7. Deploy Web App (Vercel)

1. Import repo and keep Next.js defaults.
2. Add environment variables from section 3.1.
3. Deploy production branch.
4. Verify health endpoint:

```bash
curl -sS https://<your-domain>/api/health
```

### 7.1 Cron for Mirror Sync

`/api/cron/polymarket-sync` accepts bearer auth from `POLYMARKET_SYNC_SECRET` or `CRON_SECRET`.

Current repo `vercel.json` includes a daily cron. If you need more frequent mirror refresh, update schedule there and redeploy.

## 8. Deploy Collectors

Run collectors as separate services, each with **1 replica** (single writer).

### 8.1 Polymarket Collector (Required)

Start command:

```bash
bun run collector:polymarket
```

Health endpoints:
- `/health`
- `/ready`

### 8.2 Limitless Collector (Optional)

Start command:

```bash
bun run collector:limitless
```

Important:
- If `ENABLE_LIMITLESS=false`, this process exits immediately by design.
- Deploy it only when enabling Limitless read path.

Health endpoints:
- `/health`
- `/ready`

## 9. Feature Flag Rollout

Recommended rollout path:

1. `ENABLE_LIMITLESS=false` everywhere (Polymarket-only baseline).
2. Enable `ENABLE_LIMITLESS=true` on web + Limitless collector for read path.
3. Validate list/search/feed/candles/trades for Limitless.
4. Configure `LIMITLESS_ACCESS_STATUS_URL` and `LIMITLESS_ORDER_RELAY_URL` in staging.
5. Validate access-status and relay contracts against live staging behavior.
6. Promote to production after parity checks.

Current product behavior note:
- UI currently blocks client-side Limitless order signing in this build.
- Backend adapter + relay path exists, but production trading should remain disabled until client signer integration is finalized.

## 10. Smoke Tests (Post-Deploy)

### 10.1 API and UI

1. `/catalog` loads.
2. Provider filter toggles `All / Polymarket / Limitless` (if enabled).
3. Market page loads candles/trades/comments.
4. Bookmark/comment flows still work.
5. Polymarket trade flow still completes with unchanged semantics.

### 10.2 Collector Health

For each collector service:
1. `/ready` returns `200`.
2. Logs show snapshot sync and periodic flush.
3. No recurring upsert/auth failures.

### 10.3 Database Activity

```sql
select provider, count(*)
from public.market_catalog
group by provider
order by provider;

select count(*) as live_rows from public.market_live;

select provider, max(last_success_at) as last_success
from public.provider_sync_state
group by provider
order by provider;

select count(*) as relay_audits_last_1h
from public.trade_relay_audit
where created_at > now() - interval '1 hour';
```

## 11. Security Verification Checklist

1. `SUPABASE_SERVICE_ROLE_KEY`, `PRIVY_APP_SECRET`, API credentials are never exposed as `NEXT_PUBLIC_*`.
2. CSRF is functioning on auth-cookie mutation endpoints (`auth.privyLogin`, `auth.privyLogout`, `auth.logout`).
3. `TRUST_PROXY_HEADERS` is enabled only behind trusted infra.
4. Limitless access check defaults to blocked when uncertain/misconfigured.
5. Relay idempotency is enforced via `trade_relay_audit` (`provider + user_id + idempotency_key`).
6. Confirm no secrets or signed payload bodies in logs.
7. RLS remains enabled on canonical tables.

## 12. Troubleshooting

### 12.1 Collector not writing rows

Check:
1. `SUPABASE_SERVICE_ROLE_KEY` is correct in worker runtime.
2. Network egress to upstream WS/REST endpoints is available.
3. `market_catalog` has provider rows (required for canonical realtime upserts).
4. Worker logs for `upsert failed` messages.

### 12.2 Limitless not appearing in app

Check:
1. `ENABLE_LIMITLESS=true` in Vercel runtime.
2. `LIMITLESS_API_BASE_URL` reachable from web runtime.
3. Limitless collector deployed (for realtime freshness).

### 12.3 Trade access always blocked

Check:
1. `LIMITLESS_ACCESS_STATUS_URL` configured (for Limitless).
2. Upstream geoblock/access endpoint returns explicit allow state.
3. Proxy/IP trust settings are correct.

### 12.4 Auth mutations failing with CSRF errors

Check:
1. `APP_URL` / `NEXT_PUBLIC_APP_URL` match deployed host.
2. Browser is sending `csrf_token` cookie and `x-csrf-token` header.
3. Requests are same-origin or from an allowed origin host.

## 13. Rollback Plan

If Limitless path degrades:
1. Set `ENABLE_LIMITLESS=false` in web runtime.
2. Stop `collector:limitless` service.
3. Keep Polymarket collector and web app running.

If collector fails broadly:
1. Keep web app online.
2. Restart collector service after fixing env/network issue.
3. Verify `/ready` and DB freshness before reopening traffic.

If web release regresses:
1. Roll back Vercel deployment.
2. Keep current DB schema (no destructive rollback by default).
3. Re-run smoke tests before promoting next release.
