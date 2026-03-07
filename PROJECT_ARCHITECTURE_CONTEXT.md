# Project Architecture + Database Context (Baseline)

Last updated: 2026-03-02
Scope: current `main` codebase state in this repository.

## 1) Project Essence

This project is a **Polymarket wrapper UI**:
- Users discover markets, view charts/activity/comments, and place buy orders through this app.
- Execution and liquidity live on Polymarket CLOB (Polygon), not in our DB.
- App keeps social/product data locally (profiles, comments, bookmarks, referral metadata, cached market index), but **does not custody trading keys or funds**.

Core goals right now:
- show latest markets with good UX/performance,
- enable Privy-based auth + embedded wallet,
- show an eligibility disclaimer with official Polymarket guidance,
- relay signed CLOB orders without storing secrets,
- keep deployment compatible with Vercel Hobby limits.

## 2) Current Product/Runtime Model

## 2.1 High-level architecture
- Frontend: Next.js App Router (`app/page.tsx` is the main shell for all views).
- API layer: tRPC (`/api/trpc`) for app operations.
- External read sources:
  - Polymarket Gamma API (`gamma-api.polymarket.com`) for markets/search.
  - Polymarket CLOB API (`clob.polymarket.com`) for midpoints/history/order relay.
  - Polymarket Data API (`data-api.polymarket.com`) for public trades.
- Auth:
  - Privy on client (`PrivyProvider`) + Privy server token verification.
  - Internal `auth_token` JWT cookie for backend auth context.
- Database: Supabase Postgres for social state + mirror cache.

## 2.2 Non-custodial boundaries
- Client signs with Privy wallet (`@polymarket/clob-client` via ethers BrowserProvider).
- Backend relays signed order to CLOB (`market.relaySignedOrder`) with short timeout.
- `apiCreds` and signed order are **not persisted**.
- No balances/positions/orders/fills are persisted for Polymarket execution.
- Limitless is currently read-only in-app until its official client-side signing + submission flow is wired end-to-end.

## 2.3 Deployment model
- Vercel production branch: `main` (see `vercel.json`).
- One daily cron on Hobby plan: `/api/cron/polymarket-sync` at `0 0 * * *`.
- Freshness for users is mainly request-driven (mirror-first, live fallback).

## 3) End-to-End Flows

## 3.1 Auth flow (Privy + internal app cookie)
1. User signs in through Privy modal.
2. `components/PrivyAuthBridge.tsx` gets Privy access token and calls `auth.privyLogin`.
3. Server verifies token with `@privy-io/server-auth` (`src/server/auth/privy.ts`).
4. Server upserts/links user in `public.users` by `privy_user_id` (or existing email).
5. Server issues `auth_token` HttpOnly cookie (`src/server/auth/jwt.ts`).
6. Frontend calls `auth.me` to hydrate app user state.

Logout:
- Client calls `auth.privyLogout` + Privy logout.
- App cookie is cleared.

## 3.2 Market loading flow
1. UI calls `market.listMarkets`.
2. Backend attempts mirror read (`polymarket_market_cache`) first.
3. If mirror stale/missing, backend fetches live Polymarket markets.
4. Live result is upserted into mirror and returned.
5. If live fetch fails but mirror exists, stale mirror is returned.

Mirror freshness:
- controlled by `POLYMARKET_MARKET_STALE_AFTER_MS` (default 60s).
- freshness-check cache in-memory for 15s.

UI refresh behavior:
- catalog polling every 45s while catalog is open and document is visible.

## 3.3 Search flow (keyword + semantic)
Frontend:
- user query triggers `/api/recs` after short debounce.
- semantic results boost/filter market list; missing markets fetched via `market.getMarket`.

Backend `/api/recs`:
- candidate merge from:
  - mirror keyword search,
  - live Polymarket search,
  - mirror open-market pool,
  - latest live market pool,
  - optional client-provided market list.
- pre-rank by lexical + volume + live-rank boost.
- optional embedding rank (OpenAI or HuggingFace).
- caches query/embeddings/latest pool in-memory.

Provider selection:
- `SEMANTIC_SEARCH_PROVIDER=auto|openai|huggingface`.

## 3.4 Market detail flow
When opening market page:
- price candles refreshed every 15s (`market.getPriceCandles`),
- public trades refreshed every 15s (`market.getPublicTrades`),
- comments loaded from DB.

Charts:
- binary: `lightweight-charts` candlesticks (`components/TradingViewCandles.tsx`).
- multi-outcome: Recharts multi-line series.

## 3.5 Trade flow (buy only)
1. User enters amount and selects side/outcome.
2. For Polymarket, client builds signed buy order (`src/lib/polymarket/tradingClient.ts`):
   - derive/reuse ephemeral CLOB API creds,
   - create order using Privy signer,
   - no persistent secret storage.
3. Client sends `{signedOrder, orderType, apiCreds}` to `market.relaySignedOrder`.
4. Server:
   - requires auth,
   - enforces rate limit,
   - signs L2 auth headers,
   - relays to `${CLOB}/order` with timeout.
5. Limitless execution remains disabled until the official non-custodial signer/auth flow is implemented.

Failure mapping in UI includes:
- timeout,
- insufficient balance/allowance,
- generic relay error.

## 4) API Surface (Current)

## 4.1 tRPC routers

`auth` router:
- `privyLogin`
- `privyLogout`
- `me`
- `logout` (compat alias)

`market` router:
- `listCategories`
- `listMarkets`
- `getMarket`
- `relaySignedOrder`
- `generateMarketContext`
- `myBookmarks`
- `setBookmark`
- `getPriceCandles`
- `getPublicTrades`
- `getMarketComments`
- `postMarketComment`
- `toggleMarketCommentLike`
- `myComments`

`user` router:
- `publicUser`
- `publicUserStats` (currently zeroed placeholder)
- `publicUserVotes` (currently empty placeholder)
- `publicUserComments`
- `updateDisplayName`
- `updateAvatarUrl`
- `createReferralLink`
- `leaderboard` (social ranking placeholder fields for pnl/bets)

## 4.2 REST API routes
- `GET /api/trpc/[trpc]`, `POST /api/trpc/[trpc]`
- `GET /api/cron/polymarket-sync`
- `POST /api/recs`
- `POST /api/avatar/upload`
- `POST /api/market-image/upload`
- `GET /api/health`

Telegram webhook route has been removed from active API surface.

## 5) Database Context (Current)

Primary generated DB context is in `supabase/DB_CONTEXT.md`.
Current generated snapshot metadata:
- Project ref: `lumqdmcoeyosimpszrrn`
- Source mode: Supabase REST OpenAPI fallback
- Public tables detected: 9

Important note:
- OpenAPI fallback captures columns reliably, but does not always include full index/constraint/policy details.
- For full DDL-level context use SQL dump mode in `scripts/supabase/pull-db-context-cli.ts` when available.

## 5.1 Tables and purpose

### `users`
Purpose:
- app identity profile + provider bridge metadata.

Key columns:
- `id` (uuid PK)
- `email` (unique)
- `username` (unique)
- `display_name`, `avatar_url`
- telegram profile fields (`telegram_*`)
- referral fields (`referral_code`, `referral_commission_rate`, `referral_enabled`)
- `is_admin`
- `privy_user_id` (unique partial index where not null)
- `privy_wallet_address`
- `auth_provider` (default `legacy`, now set to `privy` for bridged users)
- `created_at`

### `wallet_balances`
Purpose:
- local non-custodial app-level display balances (legacy/social accounting layer).

Key columns:
- composite PK: (`user_id`, `asset_code`)
- `balance_minor`
- `updated_at`

FK:
- `user_id -> users.id`

### `user_referrals`
Purpose:
- referral graph mapping.

Key columns:
- `id` PK
- `user_id` (unique)
- `referrer_user_id`
- `created_at`

FK:
- `user_id -> users.id`
- `referrer_user_id -> users.id`

### `market_comments`
Purpose:
- threaded market comments.

Key columns:
- `id` PK
- `market_id` (Polymarket market id/condition id string)
- `user_id`
- `parent_id` (self-reference)
- `body`
- `created_at`

Index:
- `(market_id, created_at desc)`

FK:
- `user_id -> users.id`
- `parent_id -> market_comments.id`

### `market_comment_likes`
Purpose:
- like mapping for comments.

Key columns:
- composite PK: (`comment_id`, `user_id`)
- `created_at`

FK:
- `comment_id -> market_comments.id`
- `user_id -> users.id`

### `market_bookmarks`
Purpose:
- user bookmarked markets.

Key columns:
- composite PK: (`user_id`, `market_id`)
- `created_at`

Index:
- `(user_id, created_at desc)`

FK:
- `user_id -> users.id`

### `market_context`
Purpose:
- AI-generated market context text and sources cache.

Key columns:
- `market_id` PK
- `context` text
- `sources` jsonb
- `updated_at`

### `polymarket_market_cache`
Purpose:
- mirrored market index for fast listing/filter/search and resilience.

Key columns:
- `market_id` PK
- `condition_id`, `slug`, `title`, `description`
- `image_url`, `source_url`
- `state` (`open|closed|resolved|cancelled`)
- `market_created_at`, `closes_at`, `expires_at`
- `category`, `volume`
- `clob_token_ids` jsonb
- `outcomes` jsonb
- `resolved_outcome_title`
- `search_text`
- `source_updated_at`, `last_synced_at`

Indexes:
- `state`
- `volume desc`
- `last_synced_at desc`
- trigram GIN on `search_text`

### `polymarket_sync_state`
Purpose:
- audit/progress state for mirror sync jobs.

Key columns:
- `scope` PK (`open` or `all`)
- `last_started_at`
- `last_success_at`
- `last_error`
- `updated_at`

## 5.2 Relationship summary
- Core entity: `users`.
- User-linked tables: `wallet_balances`, `user_referrals`, `market_comments`, `market_comment_likes`, `market_bookmarks`.
- Market-linked social tables (`market_*`) use external market IDs as text keys (no local markets table).
- Polymarket cache tables are standalone integration/cache layer.

## 6) Key Infrastructure + Config

Required/important env groups:
- Supabase:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Auth/JWT:
  - `AUTH_JWT_SECRET`
- Privy:
  - `NEXT_PUBLIC_PRIVY_APP_ID`
  - `PRIVY_APP_SECRET`
- Polymarket:
  - `POLYMARKET_API_BASE_URL`
  - `POLYMARKET_CLOB_API_BASE_URL`
  - `POLYMARKET_DATA_API_BASE_URL`
  - `NEXT_PUBLIC_POLYMARKET_CLOB_URL`
  - `NEXT_PUBLIC_POLYMARKET_CHAIN_ID`
  - `POLYMARKET_RELAY_TIMEOUT_MS`
  - `POLYMARKET_MARKET_STALE_AFTER_MS`
  - `POLYMARKET_SYNC_SECRET`
- Semantic search:
  - `SEMANTIC_SEARCH_PROVIDER`
  - `OPENAI_API_KEY` and/or `HUGGINGFACE_API_KEY`

## 7) Freshness, Caching, and Scale Behavior

Current effective strategy:
- Mirror-first read path for speed/cost.
- Live fallback when stale.
- In-memory short TTL caches for:
  - semantic query results,
  - embeddings,
  - latest market pool.
- Daily cron warm/backfill due Vercel Hobby limit.

Impact:
- Functionality remains intact on Hobby.
- Real freshness comes from on-demand live pulls, not high-frequency cron.

## 8) Security and Compliance Posture

Implemented protections:
- `auth_token` is HttpOnly cookie.
- Trading relay has:
  - auth requirement,
  - per-user rate limiting,
  - request size cap,
  - short timeout,
  - `Cache-Control: no-store` on sensitive paths.
- App shows a first-visit eligibility disclaimer with the official Polymarket restricted-locations link.
- Client-side signing only; no private key custody in backend.

Sensitive-data handling principle:
- Do not log/persist API secrets, signed orders, bearer tokens.

## 9) Known Gaps / Technical Debt (Important)

1. `src/types/database.ts` drift risk:
- It does not currently reflect all live public tables visible in `supabase/DB_CONTEXT.md` (notably Polymarket cache tables).
- `scripts/supabase/validate-schema.ts` should be run whenever network access to Supabase is available.

2. DB context generation mode:
- Current DB context snapshot came from OpenAPI fallback (not full SQL dump), so advanced DDL details may be incomplete.

3. Legacy artifacts still in repo:
- Solana/Anchor/hardhat and legacy helper code/files remain for history/transition.
- Some legacy Solana-oriented error mapping text still exists in UI helpers (dead path for current Polymarket wrapper execution).

4. Placeholder product analytics:
- `publicUserStats`, `publicUserVotes`, and leaderboard pnl/bets are currently placeholder/zero-based in backend.

5. Recovery migration artifact:
- `supabase/migrations/20260228000400_full_rollback_last4_for_wrong_project.sql` is a recovery script for the wrong project incident and should not be applied to the primary project DB.

## 10) How to Keep This Context Fresh

Recommended maintenance workflow:
1. Refresh DB context:
- `bun run supabase:context:cli`

2. Validate schema/types alignment:
- `bun run supabase:schema:check`

3. If alignment fails, regenerate/update `src/types/database.ts` and re-run checks.

4. Update this file when any of these change:
- API routes/tRPC procedures,
- auth/trading flow,
- Supabase schema/migrations,
- deployment cron/data freshness strategy.

## 11) Why the Current Architecture Exists

This architecture intentionally balances:
- **simplicity now**: minimal moving parts, straightforward tRPC + Supabase + Polymarket integration,
- **non-custodial safety**: no internal custody of funds/keys,
- **scaling later**: mirror cache + stateless relay + clear boundaries allow future worker/queue/index upgrades.

In short:
- execute trades on Polymarket,
- keep app UX and social layer in our stack,
- keep sync strategy compatible with current Vercel constraints,
- preserve a clear path to scale.
