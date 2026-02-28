# Cron Strategy (Hobby-Safe) and Future Optimization Plan

## Why this exists
Vercel Hobby allows cron jobs to run at most once per day. Any more frequent cron expression can fail deployment.

## Current approach (implemented now)
1. Keep only one daily Vercel cron for backfill/warm cache tasks (`0 0 * * *`).
2. Keep user-facing data freshness request-driven:
   - `listMarkets` reads mirror first when fresh.
   - If mirror is stale, it fetches live from Polymarket, upserts mirror, and returns live data.
   - If Polymarket is temporarily unavailable, stale mirror is served as fallback.
3. Trade-critical checks (geocheck/order relay/price history for chart) stay live/on-demand and are not dependent on cron.

## Functional impact
- Deployments remain unblocked on Hobby.
- Background sync is no longer minute-by-minute.
- User-facing freshness is preserved through live/on-demand Polymarket API reads.

## Operational rules
- Trading-critical checks (price, orderability, geocheck) must always be read live at action time.
- Never rely on daily cron for execution-critical data.
- Daily cron should only do non-critical warmup/backfill housekeeping.
- Mirror freshness threshold is controlled by `POLYMARKET_MARKET_STALE_AFTER_MS` (default `60000`).

## Future optimization path (when scaling)
1. Move scheduled sync from Vercel Hobby cron to a worker/scheduler that supports higher frequency.
2. Add queue-based incremental sync for hot markets.
3. Add adaptive refresh (high-volume markets refresh more often than inactive markets).
4. Add observability:
   - cache hit rate
   - API latency (p50/p95)
   - freshness lag
   - sync error rate
5. Add circuit breakers and retry policies for external API failures.

## Trigger to revisit this plan
Revisit immediately when any of these happen:
- We need sub-minute freshness guarantees.
- Search/index freshness becomes user-visible issue.
- API traffic costs/limits increase due to request-driven refreshes.
- We upgrade from Hobby and can run higher-frequency scheduled jobs.

## Ownership
- Keep this file updated whenever deployment plan, cron frequency, or data-refresh architecture changes.
