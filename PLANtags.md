# Single Taxonomy AI Tags for Catalog + Communities

## Summary
Use one app-owned, fixed AI taxonomy as the source of truth for both catalog chips and community matching. Drop venue-native categories from the UI path, keep them only as classifier input, and standardize classification on `gpt-4.1-mini` with strict JSON outputs through the Responses API.

Defaults locked from repo + your choices:
- Taxonomy mode: tags only, no separate app category layer.
- Classifier baseline: `gpt-4.1-mini`.
- Every market must always get at least one taxonomy tag.
- No model calls on request paths; classification stays async/offline.
- Use OpenAI Structured Outputs and Batch patterns from Nia-indexed docs: [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs), [Batch API](https://developers.openai.com/api/docs/guides/batch).

## Implementation Changes
### 1. Make the taxonomy a single typed source of truth
- Create one shared taxonomy registry for the current broad app-owned labels already implied by `market_ai_tags` / `PLAN2` (`crypto`, `ai`, `politics`, `sports`, etc.), including stable `id`, `labelRu`, `labelEn`, display order, and optional icon.
- Derive all of these from that registry:
  - classifier JSON schema
  - market/tag API types
  - catalog chip labels
  - community tag pickers and validation
- Remove the stale root `Category` enum / `CATEGORIES` constant as a source of truth; if `SuggestMarketModal` survives, point it at the shared taxonomy registry instead of the legacy enum.

### 2. Normalize the classifier around current-state tags
- Keep `market_ai_tags`, but make it a current-state table with `UNIQUE (market_id, tag)` and current rows only.
- Add a market-level `market_ai_classifications` table keyed by `market_id` to store:
  - `primary_tag`
  - `model`
  - `prompt_version`
  - `snapshot_fingerprint`
  - `classified_at`
- Refactor `scripts/classifier/ai-tag-classifier.ts` to use `client.responses.create` with strict JSON schema and a minimal output shape:
  - `primaryTag: TaxonomyTag`
  - `tags: Array<{ tag: TaxonomyTag; confidence: number }>` with `1..4` items
- Always persist a classification row even if only one weak tag is chosen; this avoids infinite reclassification loops for markets that would otherwise produce zero stored rows.
- Replace old tag rows for a market atomically on reclassification, then upsert the current classification state row.
- Reclassify only when the canonical snapshot fingerprint changes.
- Use the existing polling worker for incremental updates; add a one-shot Batch API backfill for the backlog to keep cost low.

### 3. Move catalog/filtering to AI tags end-to-end
- Replace client-derived category chips in `HomePageClient` with server-provided taxonomy facets.
- Add a canonical `market.listTagFacets({ providerFilter })` endpoint returning non-empty tags only for open markets in scope, plus counts.
- Add optional `tagId` to `market.listMarkets` and apply it server-side before pagination; do not keep tag filtering as a client-only post-filter.
- Extend canonical market payloads to include:
  - `primaryTagId`
  - `primaryTagLabelRu`
  - `primaryTagLabelEn`
  - required `aiTags: Array<{ tag: string; confidence: number }>`
- Update the main catalog UI to:
  - keep single-chip selection UX
  - match a market if `aiTags` contains the selected tag
  - use `primaryTag*` for the visible badge on cards/pulse/feed
  - reset to `all` if the active tag disappears for the selected provider
- Extend initial page bootstrap so tag facets render immediately on first load instead of waiting for client recomputation.
- Update `MARKET_RUNTIME_ARCHITECTURE.md` so the “no empty categories” rule becomes “provider-scoped, canonical, non-empty taxonomy facets.”

### 4. Align community logic with the same current taxonomy
- Keep community inclusion based on multi-tag matching, not primary tag only.
- Make community queries read only current tag rows, not stale rows from old `prompt_version` / fingerprints.
- Fix the existing table mismatch in `communityRouter`: owner rows must write to `community_memberships`, not `community_members`.
- Keep community tags validated against the shared taxonomy registry so catalog chips and community filters cannot drift apart.
- Use `primary_tag` instead of venue-native `category` anywhere you need a single-label fallback, including diversity/ranking helpers such as the feed.

## Public/API Changes
- Replace category-oriented market fields in the app-facing payload with `primaryTagId`, `primaryTagLabelRu`, `primaryTagLabelEn`, and required `aiTags`.
- Add `market.listTagFacets`.
- Extend `market.listMarkets` with optional `tagId`.
- Community create/update inputs remain multi-select, but tags are now constrained to the shared taxonomy ids only.

## Test Plan
- Unit:
  - taxonomy registry, Zod schema, and classifier parser accept only approved tags
  - classifier always emits one primary tag and `1..4` valid tags
  - unchanged fingerprints skip reclassification
  - markets with low-confidence outputs still record a classification state row
- Integration:
  - `listMarkets` returns `aiTags` and `primaryTag*` for both providers
  - selecting a tag filters server-side and paginates correctly
  - `listTagFacets` returns only non-empty tags for the selected provider
  - community feed includes markets that match any selected community tag, with correct match counting for multi-tag markets
  - owner membership is inserted into `community_memberships`
- UI/E2E:
  - catalog chips render from bootstrapped tag facets
  - a multi-tag market appears under each matching chip
  - market cards and pulse rows show the primary AI tag badge
  - changing provider updates available chips and invalid active chips reset to `all`

## Assumptions
- The fixed broad taxonomy already reflected in `market_ai_tags` / `PLAN2` is the app-owned taxonomy to keep.
- Venue-native `market_catalog.category` remains input/context only and is no longer trusted for UI filtering.
- No new standalone community surface is required in this pass; the required work is taxonomy alignment plus community-query correctness.
- `gpt-4.1-mini` is acceptable as “GPT-4.1” for this feature because the priority is fast, typed, cheap classification with strict JSON outputs.
