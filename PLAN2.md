# Snapshot-First Markets, Broad AI Tags, and User Communities

## Summary
Keep the strict canonical snapshot cutover, but expand the product spec in two directions:

- AI must classify all markets into a fixed, broad multi-tag taxonomy, not niche one-off categories.
- Users can create public market communities in the feed, brand them with an outline color and avatar, and define them by selecting broad AI tags.

Chosen defaults:
- AI taxonomy: fixed broad taxonomy, multi-label, applied to every market.
- Communities: public and discoverable.
- Community market scope: markets are included by AI tags only.
- Community v1 is market-centric, not a social posting system.

## Key Changes
### 1. Strict snapshot-first market architecture
- Keep `src/server/markets/readService.ts` as the only normal production read path for catalog, detail, feed candidates, search, similarity, orderbook, and candles.
- Remove remaining user-facing direct mirror/provider reads from `src/server/trpc/routers/market.ts` and keep provider access only in:
  - collectors/workers
  - venue trade relay execution
  - explicit ops/debug recovery paths
- Require all market presentation fields to come from canonical state:
  - probabilities
  - chart candles
  - external links
  - live freshness
  - trading readiness
- Keep Upstash as a fast cache of canonical snapshots, not an alternate source of truth.

### 2. Broad AI market taxonomy
- Use the existing `market_ai_tags` table and `aiTags` field on `MarketOutput` as the main enrichment layer.
- Standardize on a fixed broad vocabulary, roughly 15-30 labels. Initial set should cover the full catalog and avoid narrow clusters:
  - `crypto`
  - `technology`
  - `ai`
  - `macroeconomics`
  - `business`
  - `finance`
  - `stocks`
  - `politics`
  - `geopolitics`
  - `elections`
  - `regulation`
  - `science`
  - `weather`
  - `sports`
  - `entertainment`
  - `culture`
  - `health`
  - `energy`
  - `legal`
  - `world`
- Classification rules:
  - every market is classified
  - each market may receive multiple tags
  - tags must come only from the fixed vocabulary
  - do not create low-cardinality niche tags
  - keep venue-native `category` separate from AI tags
- Run the classifier from canonical snapshot inputs only:
  - title
  - description
  - native category
  - outcomes
  - provider
  - source URL/domain
  - compare-group context when available
- Use OpenAI `gpt-5-nano` through the Responses API with structured JSON output, because OpenAI’s current docs position it as the fastest, most cost-efficient GPT-5 model and suitable for classification.
- Reclassification policy:
  - classify new markets immediately after snapshot ingestion
  - reclassify only when the snapshot fingerprint changes
  - preserve old tags for unchanged fingerprints
  - never block user reads on classification

### 3. Public user-created communities in the feed
- Add a new public community subsystem, separate from existing user profiles and bookmarks.
- New DB model:
  - `communities`
    - `id`
    - `creator_user_id`
    - `slug`
    - `name`
    - `description`
    - `avatar_url`
    - `accent_color`
    - `visibility` (`public`)
    - `created_at`, `updated_at`
  - `community_tag_filters`
    - `community_id`
    - `tag`
    - one row per selected AI tag
  - `community_memberships`
    - `community_id`
    - `user_id`
    - `role` (`owner` for v1, optional `member` if follow/join is exposed)
    - `created_at`
- Community behavior:
  - creator chooses a name, avatar, accent color, and one or more AI tags
  - community feed shows canonical markets whose `market_ai_tags` match the community’s selected tags
  - one market can belong to many communities
  - markets inherit the community accent color in community-specific feed/card rendering only; canonical market data stays unchanged
- Feed product changes:
  - add community discovery/list endpoints
  - add create/update community endpoints for authenticated users
  - add community market-feed endpoint that ranks only markets matching that community’s selected tags
  - keep the global feed and community feeds separate; global feed remains market-ranked, communities are filtered overlays on top of canonical markets
- UI changes:
  - add create-community flow
  - let the user upload/select a community avatar
  - let the user choose an accent color
  - let the user choose multiple AI tags from the fixed taxonomy
  - in community views, render market cards/feed items with the community outline color and community identity

### 4. Trading and auth requirements remain enforced
- Trade relay remains available for both `polymarket` and `limitless`, but every relay must resolve through canonical market IDs and canonical open-state checks first.
- Preserve and harden same-email Privy auto-linking:
  - if Privy email matches an existing account, link that account instead of creating a new one
  - preserve all profile/history/referral/admin data on link
  - cover the linking path with dedicated regression tests

## Public/API Changes
- `MarketOutput.aiTags` becomes required in canonical market responses once classification is backfilled.
- Add community APIs for:
  - create/update/read/list public communities
  - list a community’s selected tags
  - fetch a community market feed
- Feed endpoints should support community-scoped retrieval without introducing a separate post model in v1.

## Test Plan
- Unit:
  - classifier accepts only approved broad tags
  - each market can receive multiple tags
  - no model-generated out-of-vocabulary tag is persisted
  - community membership-by-tag query returns the correct market set
  - community accent color affects only community-scoped rendering metadata
  - Privy same-email login resolves to the existing user
- Integration:
  - all catalog/detail/search/feed/community market reads are canonical-only
  - newly ingested markets receive AI tags
  - updated snapshot fingerprint triggers reclassification
  - community feed returns markets from both providers when tags match
  - community cards render with creator-selected outline color and avatar
- Ops:
  - health checks expose classifier lag and unclassified-market count
  - health checks expose canonical coverage by provider
  - degraded pipeline state is visible when snapshot freshness or classification freshness falls behind

## Assumptions
- Community v1 is a market-filtering/community-branding system, not a Reddit/Discord-style posting layer.
- Communities are public and discoverable by default.
- Community membership can start as simple creator ownership plus optional follow/join; no complex moderation roles are required for v1.
- Community inclusion is based only on AI tags, not manual per-market curation.
- The broad AI taxonomy is controlled by the app and does not allow free-form model-generated categories.
