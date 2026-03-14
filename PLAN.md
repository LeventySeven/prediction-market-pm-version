# Snapshot-First Catalog, AI Tags, and Privy Account Linking

## Summary
Move the product to a strict canonical snapshot architecture for all user-facing market reads, keep both `polymarket` and `limitless` fully tradable through the app, add a low-cost OpenAI-based market tagger, and make same-email Privy login a guaranteed account-link path.

Chosen defaults:
- Snapshot cutover: strict user-facing cutover, with provider fallbacks allowed only in explicit ops/debug code paths.
- AI categorization: multi-label enrichment, separate from venue-native `category`.
- Privy linking: auto-link to the existing account when the Privy email matches.

## Key Changes
### 1. Strict canonical snapshot cutover
- Make `src/server/markets/readService.ts` the only production source of truth for catalog, detail, orderbook, candles, and market freshness metadata.
- Remove user-facing mirror/live-provider branches from:
  - `src/server/trpc/routers/market.ts` search/similarity paths
  - `src/server/trpc/routers/feed.ts`
  - any direct `listMirroredPolymarketMarkets`, `getMirroredPolymarketMarketById`, `listPolymarketMarkets`, `getPolymarketMarketById`, or adapter snapshot calls used to serve UI responses
- Keep provider reads only for:
  - collectors/workers
  - relay execution against venue APIs
  - explicit degraded-mode/ops endpoints, not normal catalog traffic
- Disable hot-read behavior behind config by default:
  - `ENABLE_MARKET_HOT_READ_FALLBACK=false`
  - `ENABLE_CATALOG_SYNC_ON_READ=false` for request-path repair
- Make `feed`, `searchSemantic`, and `getSimilar` read from canonical tables only:
  - `market_catalog`
  - `market_outcomes`
  - `market_live`
  - `market_candles_1m`
  - `market_embeddings`
  - `market_compare_groups` / `market_compare_members`
- Keep Upstash snapshot pages as the fast cache layer, but treat them as cache of canonical state, not an alternate source of truth.

### 2. Snapshot correctness and worker alignment
- Define canonical correctness invariants and enforce them in workers and read mapping:
  - displayed probability comes from canonical outcome probability / price mapping only
  - binary `chance` uses canonical live-aware resolution logic
  - chart candles come only from canonical `market_candles_1m`
  - external links come from canonical slug/source normalization only
  - relay readiness checks always resolve canonical market IDs before trade submission
- Update both collectors so they explicitly guarantee:
  - catalog rows, outcomes, live rows, and candles are written atomically enough for readers to avoid mixed-state markets
  - provider sync state reports coverage, lag, and tracked-market counts for both venues
  - canonical live/candle coverage is monitored against open catalog coverage
- Extend `src/server/ops/realtimeHealth.ts` to add hard launch checks:
  - canonical coverage percentage by provider
  - stale snapshot age
  - count of markets missing outcomes/live/candles
  - mismatch counts between provider open markets and canonical open markets
- Keep trading enabled on both venues, but require canonical market resolution before calling `relaySignedOrder`; no direct venue-only trade path should bypass canonical market existence/open-state checks.

### 3. AI market-tag enrichment layer
- Add a dedicated enrichment store rather than overloading `market_catalog.category`.
- New DB shape:
  - `market_ai_tags`
    - `market_id`
    - `tag`
    - `confidence`
    - `model`
    - `prompt_version`
    - `snapshot_fingerprint`
    - `classified_at`
    - unique key on `(market_id, tag, prompt_version, snapshot_fingerprint)`
  - optional lightweight run table only if needed for ops visibility; otherwise use `provider_sync_state`-style stats for the classifier worker
- Initial taxonomy:
  - `crypto`
  - `technology`
  - `macroeconomics`
  - `business`
  - `politics`
  - `geopolitics`
  - `elections`
  - `sports`
  - `science`
  - `weather`
  - `entertainment`
  - `regulation`
- Classifier input should be snapshot-only and cheap:
  - title
  - description
  - native category
  - outcomes
  - source URL/domain
  - provider
  - compare-group context if present
- Use OpenAI `gpt-5-nano` via the Responses API for classification.
  - Reasoning: official OpenAI model docs currently describe `gpt-5-nano` as the fastest, most cost-efficient GPT-5 model and explicitly suitable for summarization/classification tasks.
  - Use Structured Outputs / JSON schema so the model returns only allowed tags plus confidences.
- Classifier behavior:
  - run only for markets whose snapshot fingerprint changed or which have never been classified
  - write tags only above a fixed confidence threshold
  - keep previous tags for unchanged fingerprints
  - never block catalog reads on classification
- API/interface additions:
  - extend market output with `aiTags: Array<{ tag: string; confidence: number }>`
  - extend category/filter APIs with optional AI-tag facets, but keep native category and AI tags separate
  - feed/search/similarity ranking may incorporate AI tags only after canonical cutover is complete

### 4. Privy same-email account linking
- Preserve the current intended behavior in `src/server/trpc/routers/auth.ts`, but make it explicit and fully covered:
  - if `privy_user_id` already exists, return that user
  - else if wallet match exists, link that user
  - else if normalized email match exists, link that existing user
  - else create a new Privy-backed user
- Tighten matching and conflict rules:
  - normalize email case/whitespace consistently before lookup/update
  - never create a second user when the normalized email already belongs to an existing account
  - preserve existing profile, referrals, balances, comments, bookmarks, and admin flags on link
  - update `auth_provider`, `privy_user_id`, and `privy_wallet_address` on the existing row
- Add an auth invariant test matrix for:
  - legacy email user -> Privy login with same email
  - existing Privy-linked user re-login
  - wallet match without email
  - duplicate insert race resolving back to the existing row
  - placeholder Privy email users later adding a real email

## Public/API Changes
- `MarketOutput` gains `aiTags`.
- Category/filter API gains optional AI-tag facets; native category remains unchanged.
- No trade API shape change is required unless the current client lacks canonical market IDs for relay calls; if so, require canonical `marketId` and provider on trade relay input.

## Test Plan
- Unit:
  - canonical read service never falls back to provider/mirror in normal paths
  - chart series uses canonical candles only and remains stable
  - external link normalization works for both providers from canonical slugs/source URLs
  - AI classifier parser accepts only allowed tags and rejects invalid schema output
  - Privy linking resolves same-email login to existing user row
- Integration:
  - catalog/search/feed/detail return only canonical-backed markets for both providers
  - trade relay for both providers succeeds only when canonical market is open and trading-enabled
  - changed snapshot fingerprint triggers reclassification; unchanged fingerprint does not
- Ops/health:
  - failing health snapshot when canonical coverage or freshness drops below threshold
  - provider/canonical mismatch surfaced in health output
- Regression:
  - no Polymarket-only behavior remains in feed/search/similarity
  - Limitless markets have working links, probabilities, candles, and relay readiness

## Assumptions
- Provider fallbacks remain available only for workers, debug, and ops recovery, not user-facing catalog requests.
- AI tags are additive metadata, not a replacement for the venue’s native category.
- `gpt-5-nano` is the default classifier model, using OpenAI Structured Outputs with a fixed schema and low-latency settings.
- Existing mirror tables may remain temporarily for migration safety, but they are no longer part of normal read-path logic once the cutover is complete.
