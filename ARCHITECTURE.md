# Loading Architecture: Instant UX with SSR + Silent Background Loading

## Core Principle

**Never make the user wait for data they don't need yet.** The app uses a 5-layer loading cascade where each layer is faster than the next, and every layer is a fallback for the one above it:

```
Layer 0: SSR Bootstrap       (0ms client-side — HTML arrives with data baked in)
Layer 1: Warm Cache           (0ms — localStorage from previous session)
Layer 2: Upstash Redis        (3-15ms — edge cache, pre-computed snapshots)
Layer 3: Supabase DB          (50-200ms — source of truth)
Layer 4: Venue API            (200-2000ms — external provider fallback)
```

---

## Stack Overview

| Layer | Technology | Role |
|-------|-----------|------|
| Framework | Next.js 15 (App Router) | SSR, routing, server components |
| API | tRPC v10 | Type-safe RPC between client and server |
| Database | Supabase (PostgreSQL) | Source of truth for all market data |
| Edge Cache | Upstash Redis | Short-TTL cache between server and DB |
| Realtime | WebSocket + Upstash SSE + Supabase Realtime | Live price updates |
| Client State | React useState/useRef + localStorage | Session cache, warm cache |
| Auth | Privy.io | Wallet/social auth, non-custodial |
| Styling | Tailwind CSS | Utility-first, no runtime CSS |

---

## Layer 0: Server-Side Rendering (First Paint)

### What happens

User hits `/catalog` → Next.js server component runs → fetches 60 markets from Upstash/Supabase → bakes them into HTML → sends to browser. User sees a full page of markets before any JavaScript executes.

### Files

- `app/page.tsx` — entry point, calls `getHomePageInitialData()`
- `app/catalog/page.tsx` — catalog route, same pattern
- `app/market/[marketId]/page.tsx` — market detail, calls `getMarketRouteInitialData()`
- `src/server/markets/pageData.ts` — all SSR data assembly

### The flow

```
app/page.tsx (Server Component)
│
├─ getHomePageInitialData()                     [pageData.ts]
│  ├─ getPublicEnabledProviders()               // which venues are live (polymarket, limitless)
│  └─ buildCatalogBootstrapEntry()              // fetch page 1 of markets
│     └─ listCanonicalMarkets({
│         page: 1,
│         pageSize: 61,                         // 60 + 1 to detect hasMore
│         sortBy: "volume",
│         catalogBucket: "main"
│       })
│       └─ (hits Upstash Redis first, then Supabase — see Layer 2)
│
└─ returns HomePageInitialData
   ├─ initialView: "CATALOG"
   ├─ initialProviderFilter: "all"
   ├─ initialCatalogBootstrap:
   │  ├─ fetchedAt: timestamp
   │  ├─ enabledProviders: ["polymarket", "limitless"]
   │  └─ entries: [{
   │       rows: MarketApiRow[60],              // first 60 markets, sorted by volume
   │       hasMore: true,
   │       snapshotId: 42,                      // for cache coherence
   │       source: "redis" | "supabase"
   │     }]
   └─ initialEnabledProviders: [...]

→ <HomePageClient {...initialData} />           // passed as props to client component
```

### Market detail pages

For `/market/[marketId]`, the server also pre-fetches charts, trades, activity, and comments — all in parallel with a **3-second hard timeout** so the page never blocks on slow data:

```typescript
// pageData.ts — getMarketDetailData()

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);

const MARKET_DETAIL_TIMEOUT_MS = 3_000;

const [candles, trades, activity, comments] = await Promise.all([
  withTimeout(getCanonicalPriceCandles(...).catch(() => []), MARKET_DETAIL_TIMEOUT_MS, []),
  withTimeout(caller.market.getPublicTrades(...).catch(() => []), MARKET_DETAIL_TIMEOUT_MS, []),
  withTimeout(caller.market.getLiveActivity(...).catch(() => []), MARKET_DETAIL_TIMEOUT_MS, []),
  withTimeout(caller.market.getMarketComments(...).catch(() => []), MARKET_DETAIL_TIMEOUT_MS, []),
]);
```

### Why this matters

The user sees a rendered page with real data in the initial HTML. No loading spinners on first paint, no layout shift. If any detail fetch is slow, the page renders anyway with empty arrays — the client fills them in silently.

### Key config

```typescript
// app/page.tsx
export const revalidate = 15;  // ISR: regenerate every 15 seconds

// pageData.ts
const CATALOG_BOOTSTRAP_PAGE_SIZE = 60;
const DEFAULT_CATALOG_BOOTSTRAP_SORT = "volume";
```

---

## Layer 1: Warm Cache (Instant Revisits)

### What happens

After the first visit, the client saves the bootstrap data to `localStorage`. On the next visit (or tab reopen within 90 seconds), the client reads this instantly (0ms) while the SSR HTML may still be loading.

### Files

- `components/HomePageClient.tsx` — read (lines 755-779), write (lines 2167-2200)

### The flow

**On mount — choose best available data:**

```typescript
// HomePageClient.tsx
const bootstrappedCatalog = initialCatalogBootstrap     // from SSR props (best)
                          ?? readWarmCatalogBootstrap(); // from localStorage (fallback)
```

**Reading warm cache:**

```typescript
const CATALOG_WARM_CACHE_KEY = "catalog_bootstrap_v6";
const CATALOG_WARM_CACHE_TTL_MS = 90_000; // 90 seconds

function readWarmCatalogBootstrap(): InitialCatalogBootstrap | null {
  const raw = localStorage.getItem(CATALOG_WARM_CACHE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);

  // TTL check — stale warm cache is worse than no cache
  if (Date.now() - parsed.fetchedAt > CATALOG_WARM_CACHE_TTL_MS) return null;

  // Structural validation — only accept well-formed entries
  if (!Array.isArray(parsed.entries)) return null;
  for (const entry of parsed.entries) {
    if (!entry.cacheKey || !Array.isArray(entry.rows) || entry.page !== 1) return null;
  }
  return parsed;
}
```

**Writing warm cache (after every successful catalog load):**

```typescript
function writeWarmCatalogCache() {
  // Build entries for each provider filter variant
  for (const providerFilter of [...enabledProviders, "all"]) {
    const cacheKey = buildCatalogFetchKey({ providerFilter, page: 1, ... });
    const cached = catalogPageCacheRef.current.get(cacheKey);
    if (!cached) continue;

    entries.push({
      cacheKey,
      providerFilter,
      page: 1,
      rows: cached.rows.slice(0, CATALOG_PAGE_SIZE),
      hasMore: cached.hasMore,
      snapshotId: cached.snapshotId,
      updatedAt: cached.updatedAt,
    });
  }

  localStorage.setItem(CATALOG_WARM_CACHE_KEY, JSON.stringify({
    fetchedAt: Date.now(),
    enabledProviders,
    entries,
  }));
}
```

### Why this matters

When the user navigates away and comes back within 90 seconds, markets appear instantly from localStorage without waiting for SSR. The SSR result replaces it if fresher. Version the key (`_v6`) so deploys invalidate stale structures.

---

## Layer 2: Upstash Redis (Edge Cache)

### What happens

Between the Next.js server and Supabase sits an Upstash Redis layer. Market lists, candles, trades, and orderbooks are cached here with short TTLs. Most SSR reads hit Redis (3-15ms), not the database (50-200ms).

### Files

- `src/server/cache/upstash.ts` — all cache key builders, read/write operations, TTLs
- `src/server/markets/readService.ts` — consumer of the cache

### Cache read cascade for `listCanonicalMarkets`

The server tries 4 cache layers in order before hitting the database:

```
1. Upstash Snapshot Shards (pre-computed by background worker)
   Key: snapshot:v2:{snapshotId}:{pageScope}:shard:{0..N}
   Written by: snapshot worker
   Read by: readUpstashSnapshotRows()

2. Upstash "Latest" List (most recent write for this query shape)
   Key: markets:list:latest:v2:open:1:page:1:size:60:sort:volume:bucket:main:providers:polymarket,limitless
   Written by: listCanonicalMarkets() on cache miss
   Read by: readUpstashCache(latestListCacheKey)

3. Upstash Versioned List (pinned to specific snapshotId)
   Key: markets:list:v2:open:1:page:1:size:60:sort:volume:snapshot:42:bucket:main:providers:...
   Written by: listCanonicalMarkets() on cache miss
   Read by: readUpstashCache(listCacheKey)

4. Supabase DB (full query with joins)
   → market_catalog + market_outcomes + market_live + market_ai_classifications + market_ai_tags
   → All 4 tables queried in parallel via Promise.all
   → Results written back to layers 2 and 3
```

### Cache key patterns

```typescript
// Market list
"markets:list:v2:open:1:page:1:size:60:sort:volume:snapshot:42:bucket:main:providers:polymarket,limitless"

// Market detail
"market:detail:v2:polymarket:0xabc123..."

// Price candles
"market:candles:v2:polymarket:0xabc123:shape:real-only-v2:interval:1h:limit:720:range:1M"

// Public trades
"market:trades:v2:polymarket:0xabc123:limit:50"

// Live state (for realtime patches)
"realtime:market:live:v2:polymarket:0xabc123"
```

### TTLs

| Cache Key | TTL | Why |
|-----------|-----|-----|
| Market list | dynamic (tied to snapshot) | Changes when worker publishes new snapshot |
| Market detail | **7 seconds** | Prices change fast; short TTL keeps it fresh |
| Price candles | **60 seconds** | Charts tolerate slight staleness |
| Public trades | **3 seconds** | Trades are near-realtime data |
| Live state | **60 seconds** | Backing store for realtime patches |
| Activity ticks | **120 seconds** | Activity feed is less time-critical |
| Snapshots | **300 seconds** | Pre-computed pages, refreshed by worker |
| Tag facets | **120 seconds** | Filter chip counts don't change fast |

### Read/Write operations

```typescript
// upstash.ts

async function readUpstashCache<T>(key: string, schema: z.ZodType<T>): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  // Unwrap envelope: { v: 2, cachedAt: timestamp, data: T }
  const envelope = typeof raw === "object" && raw.v === 2 ? raw.data : raw;
  const parsed = schema.safeParse(envelope);
  return parsed.success ? parsed.data : null;
}

async function writeUpstashCache<T>(key: string, value: T, ttlSec: number): Promise<void> {
  await redis.set(key, { v: 2, cachedAt: Date.now(), data: value }, { ex: ttlSec });
  // Best-effort — never throw on cache write failure
}
```

---

## Layer 3: Realtime Updates (Live Prices)

### What happens

After the page loads with SSR data, a realtime connection opens to push live price updates to visible markets. No polling for prices — updates arrive in 120ms batches.

### Files

- `components/HomePageClient.tsx` — lines 2827-3030 (stream setup)
- `src/lib/marketsRealtimeProtocol.ts` — message parsing
- `app/api/stream/markets/route.ts` — SSE endpoint

### Three transport layers with automatic fallback

```
┌──────────────────────────────────────────────┐
│  1. WebSocket (primary, lowest latency)      │
│     URL: NEXT_PUBLIC_MARKETS_WS_URL          │
│     Ping: every 15s                          │
│     On error/close → fall through            │
├──────────────────────────────────────────────┤
│  2. Upstash SSE (secondary)                  │
│     URL: /api/stream/markets?ids=m1,m2,...   │
│     Protocol: EventSource, "live" events     │
│     On error → fall through                  │
├──────────────────────────────────────────────┤
│  3. Supabase Realtime (last resort)          │
│     Table: polymarket_market_live            │
│     Filter: visible market IDs only          │
└──────────────────────────────────────────────┘
```

### Smart subscription — only visible markets

The client only subscribes to markets currently visible in the viewport, capped at 200:

```typescript
const targetIds = visibleCatalogMarketIds.slice(0, 200);

socket.send(JSON.stringify({
  type: "subscribe",
  pageScope: activeCatalogFetchKey,
  marketIds: targetIds,
  lastSnapshotId: currentCatalogSnapshotId,
  lastSeq: lastStreamSeq,
}));
```

### Patch batching for performance

Raw patches arrive frequently. Instead of re-rendering on every patch, they accumulate in a queue and flush every 120ms:

```typescript
const pendingPatches = new Map<string, MarketLivePatch>();

function queuePatch(marketId: string, patch: MarketLivePatch) {
  const existing = pendingPatches.get(marketId);
  pendingPatches.set(marketId, existing ? mergeMarketLivePatch(existing, patch) : patch);
}

// Flush every 120ms (SELECTED_MARKET_REALTIME_FLUSH_MS)
const flushTimer = setInterval(() => {
  if (pendingPatches.size === 0) return;
  const batch = new Map(pendingPatches);
  pendingPatches.clear();
  setMarketLivePatchById(prev => {
    const next = { ...prev };
    for (const [id, patch] of batch) {
      if (!hasMaterialPatchChange(next[id], patch)) continue; // skip noise
      next[id] = mergeMarketLivePatch(next[id], patch);
    }
    return next;
  });
}, 120);
```

### Reconciliation on drift

If the stream detects that client data has drifted from server state (snapshot ID mismatch), it triggers a full catalog reload:

```typescript
// Message type: "resync_required"
// → loadMarkets() fetches fresh from tRPC
// → merges with live patches
// → updates UI
```

---

## Layer 4: Client-Side Background Loading

### What happens

After initial render, the client silently loads additional data in the background — next catalog pages, market detail data, updated candles — without the user noticing any loading state.

### Infinite scroll (catalog pagination)

An `IntersectionObserver` watches an invisible sentinel div placed after the last market card. It triggers 480px before the sentinel enters the viewport — the user never sees a loading state:

```typescript
const observer = new IntersectionObserver(
  ([entry]) => {
    if (entry.isIntersecting && hasNextCatalogPage && !loadingMarkets) {
      setCatalogPage(prev => prev + 1); // triggers loadMarkets effect
    }
  },
  {
    rootMargin: "480px 0px",  // start loading 480px before visible
    threshold: 0.01,
  }
);
observer.observe(catalogLoadMoreSentinelRef.current);
```

### Market detail lazy loading

When the user clicks a market, data loads in stages so something appears immediately:

```
Stage 1 (0ms):
  → setSelectedMarketId(market.id)
  → Market data is already in the catalog array — renders immediately
  → URL updates via router.push (no page reload)

Stage 2 (~50ms):
  → Check marketCandlesCacheRef for cached candles
  → If fresh (< 30s) → show immediately
  → If stale → show stale data, fetch fresh in background
  → If empty → show skeleton, fetch candles

Stage 3 (~200ms, parallel):
  → trpcClient.market.getPriceCandles.query()
  → trpcClient.market.getPublicTrades.query()
  → trpcClient.market.getLiveActivity.query()
  → trpcClient.market.getMarketComments.query()
  → Each arrives independently, UI updates incrementally

Stage 4 (ongoing):
  → Candle polling: refetch every 60s (or 15s for 1-minute candles)
  → Realtime patches continue updating prices
```

### Stale-while-revalidate pattern

This pattern is used everywhere — show old data instantly, fetch fresh in background:

```typescript
const cachedEntry = marketCandlesCacheRef.current.get(candleCacheKey);
const isFresh = cachedEntry && Date.now() - cachedEntry.cachedAt <= 30_000;
const isStale = cachedEntry?.candles?.length > 0;

if (!isFresh && isStale) {
  setMarketCandles(cachedEntry.candles);  // show stale data immediately
}
// Always fetch fresh data regardless
fetchCandles();
```

### Prefetch reuse from SSR

When the market detail page loads via SSR, candles are already in the initial props. The client detects this and skips the first fetch:

```typescript
const prefetchedRef = useRef(initialMarketCandles);

// In the candle loading effect:
if (prefetchedRef.current.length > 0 && market.id === initialSelectedMarketId) {
  setMarketCandles(prefetchedRef.current);
  prefetchedRef.current = []; // consume once
  return; // skip tRPC fetch
}
```

---

## Layer 5: Navigation (No Full Reloads)

### What happens

All navigation is client-side. URL updates via `history.pushState` / Next.js `router.push`. No full page reloads ever after the initial load.

### Files

- `components/HomePageClient.tsx` — lines 1050-1187

### Navigation functions

```typescript
// Open a market (client-side navigation)
const navigateToMarketUrl = useCallback((marketId: string, title?: string | null) => {
  const slug = title ? slugifyTitle(title) : "";
  const query = slug ? `?title=${encodeURIComponent(slug)}` : "";
  const path = `/market/${encodeURIComponent(marketId)}${query}`;
  router.push(path as Route, { scroll: false });
}, [router]);

// Switch views (catalog, feed, leaderboard, profile)
const navigateToViewUrl = useCallback((view: ViewType) => {
  const path = view === "CATALOG"
    ? getCatalogPathForProvider(activeProviderFilter)
    : getPathForView(view);
  router.push(path as Route, { scroll: false });
}, [activeProviderFilter, router]);
```

### URL state for catalog filters

Filter changes update the URL via `replaceState` (not `pushState`) so the browser back button goes to the previous page, not the previous filter state:

```typescript
// Every filter change syncs to URL
useEffect(() => {
  const params = new URLSearchParams();
  if (searchQuery) params.set("q", searchQuery);
  if (activeCategoryId !== "all") params.set("category", activeCategoryId);
  if (catalogSort !== DEFAULT_CATALOG_SORT) params.set("sort", catalogSort);
  // ... more filters

  const nextUrl = `${basePath}?${params.toString()}`;
  commitHistoryNavigation("replace", nextUrl, { view: "CATALOG" });
}, [activeCategoryId, catalogSort, searchQuery, /* ... */]);
```

### Browser back/forward support

A `popstate` listener restores full application state from the URL:

```typescript
useEffect(() => {
  const handler = () => {
    const marketId = getMarketIdFromLocation();     // parse /market/{id} from URL
    setSelectedMarketId(marketId);                   // open/close market detail

    const nextView = getViewFromLocation();          // detect view from pathname
    setCurrentView(nextView);

    applyCatalogStateFromUrl();                      // restore all filters from URL params
  };

  window.addEventListener("popstate", handler);
  return () => window.removeEventListener("popstate", handler);
}, []);
```

### History throttling

To prevent excessive history entries during rapid filter changes:

```typescript
const HISTORY_NAVIGATION_THROTTLE_MS = 200;

function commitHistoryNavigation(method: "push" | "replace", url: string, state: object) {
  const now = Date.now();
  if (now - lastHistoryMutationRef.current < HISTORY_NAVIGATION_THROTTLE_MS) {
    method = "replace"; // downgrade push to replace if too fast
  }
  lastHistoryMutationRef.current = now;
  window.history[method === "push" ? "pushState" : "replaceState"](state, "", url);
}
```

---

## Complete Data Flow: Market Catalog

```
USER HITS /catalog
│
├─ SERVER (Next.js)
│  └─ getHomePageInitialData()
│     └─ listCanonicalMarkets()
│        ├─ Try: Upstash Snapshot shards          → HIT → return
│        ├─ Try: Upstash "latest" list cache      → HIT → return
│        ├─ Try: Upstash versioned list cache      → HIT → return
│        └─ Miss: Supabase query (parallel)
│           ├─ market_catalog (60 rows)
│           ├─ market_outcomes (for those 60)
│           ├─ market_live (for those 60)
│           ├─ market_ai_classifications (for those 60)
│           └─ market_ai_tags (for those 60)
│           → Write back to Upstash
│           → Return MarketPageOutput
│     → Bake into <HomePageClient> props
│     → Send HTML to browser
│
├─ CLIENT (Hydration, 0ms)
│  ├─ Read initialCatalogBootstrap from props
│  ├─ OR: readWarmCatalogBootstrap() from localStorage
│  └─ Render 60 market cards immediately
│
├─ CLIENT (Background, ~50ms)
│  ├─ Open WebSocket / SSE for realtime prices
│  ├─ Subscribe to visible market IDs (up to 200)
│  └─ Start receiving price patches
│
├─ CLIENT (Background, ~200ms)
│  ├─ Fetch tag facets for filter chips
│  └─ Write warm cache to localStorage
│
├─ CLIENT (On scroll, continuous)
│  ├─ IntersectionObserver detects approaching bottom (480px ahead)
│  ├─ setCatalogPage(2) → loadMarkets()
│  ├─ trpcClient.market.listMarkets.query({ page: 2 })
│  │  └─ Server: same Upstash → Supabase cascade
│  └─ Append to catalog, update warm cache
│
└─ CLIENT (Realtime, continuous)
   ├─ WebSocket/SSE patch arrives
   ├─ Queue patch in pendingPatches Map
   ├─ Flush every 120ms
   ├─ Only apply if material change (EPS threshold)
   └─ React re-renders affected MarketCard components
```

---

## Complete Data Flow: Market Detail

```
USER CLICKS MARKET CARD
│
├─ CLIENT (0ms)
│  ├─ setSelectedMarketId(market.id)
│  ├─ Market data already in catalog array → renders immediately
│  ├─ router.push("/market/polymarket:0x...") → URL updates, no reload
│  └─ MarketPage component mounts with market data from catalog
│
├─ CLIENT (0ms-50ms)
│  ├─ Check marketCandlesCacheRef for cached candles
│  │  ├─ Fresh (< 30s) → show immediately, skip fetch
│  │  ├─ Stale (> 30s, has data) → show stale, fetch in background
│  │  └─ Empty → show skeleton
│  └─ Track view event (analytics, best-effort)
│
├─ CLIENT (~200ms, parallel)
│  ├─ trpcClient.market.getPriceCandles.query()
│  │  └─ Server: Upstash candle cache (60s TTL) → Supabase → Venue API fallback
│  ├─ trpcClient.market.getPublicTrades.query()
│  │  └─ Server: Upstash trades cache (3s TTL) → Supabase
│  ├─ trpcClient.market.getLiveActivity.query()
│  │  └─ Server: Upstash activity cache (120s TTL) → Supabase
│  └─ trpcClient.market.getMarketComments.query()
│     └─ Server: Supabase direct (no cache)
│
├─ CLIENT (ongoing)
│  ├─ Candle polling: refetch every 60s (or 15s for 1m interval)
│  ├─ Realtime patches update price display
│  └─ Cache candles in marketCandlesCacheRef with 30s TTL
│
└─ USER HITS BACK BUTTON
   ├─ popstate event fires
   ├─ setSelectedMarketId(null) → closes detail view
   ├─ applyCatalogStateFromUrl() → restores filters
   └─ Catalog is still in memory → renders instantly
```

---

## Client-Side Caches Summary

| Cache | Storage | Key | TTL | What |
|-------|---------|-----|-----|------|
| Warm catalog | `localStorage` | `catalog_bootstrap_v6` | 90s | First page of markets for instant revisit |
| Catalog pages | `useRef<Map>` | `provider:all:page:1:sort:volume:...` | Session | All loaded catalog pages |
| Candle data | `useRef<Map>` | `marketId:interval:limit:range` | 30s | Chart data per market per range |
| Live patches | `useState` | `Record<marketId, patch>` | Session | Realtime price/volume updates |
| Ensured markets | `useRef<Set>` | market IDs | Session | Prevents duplicate detail fetches |

---

## Server-Side Caches Summary

| Cache | Storage | TTL | What |
|-------|---------|-----|------|
| Market list | Upstash Redis | Dynamic | Full pages of market data |
| Market detail | Upstash Redis | 7s | Single market hydrated view |
| Candles | Upstash Redis | 60s | Price chart data |
| Trades | Upstash Redis | 3s | Recent public trades |
| Live state | Upstash Redis | 60s | Current prices for realtime |
| Activity ticks | Upstash Redis | 120s | Live trade/order activity |
| Snapshots | Upstash Redis | 300s | Pre-sharded full catalog |
| Tag facets | In-memory Map | 120s | Category filter chip counts |
| Category rows | In-memory Map | 60s | Legacy category data |

---

## Key Patterns to Replicate

### 1. SSR bootstrap with props

Server component fetches critical data, passes everything to a single client component as `initialData`. No client-side fetch-on-mount for above-the-fold content.

```typescript
// Server component
export default async function Page() {
  const data = await getInitialData();
  return <ClientApp {...data} />;
}
```

### 2. localStorage warm cache with TTL

Write the bootstrap payload to localStorage after every successful load. Read on mount as an instant fallback. Version the key so deploys invalidate stale structures.

```typescript
const CACHE_KEY = "app_bootstrap_v1";
const CACHE_TTL = 90_000;

// Read
const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) useCached(cached);

// Write (after successful load)
localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), data }));
```

### 3. Edge cache between server and DB

Put Upstash Redis (or similar) between your server and database. Use short TTLs (3-60s). Version cache keys with snapshot IDs for coherence.

### 4. Timeout protection on SSR

Wrap every non-critical SSR fetch in `Promise.race` with a timeout. The page renders fast; the client backfills missing data.

```typescript
const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), ms))]);
```

### 5. Realtime with fallback chain

WebSocket → SSE → Database Realtime. Batch patches (don't re-render on every tick). Only subscribe to visible items. Use EPS thresholds to filter noise.

### 6. Stale-while-revalidate everywhere

Show stale data immediately, fetch fresh in background. Apply fresh data only if the component is still mounted and the request is still relevant (use sequence IDs to discard stale responses).

### 7. Prefetch on scroll proximity

`IntersectionObserver` with generous `rootMargin` starts loading the next page before the user reaches the bottom. They never see a loading indicator.

### 8. Client-side navigation only

`router.push({ scroll: false })` for page changes. `replaceState` for filter changes (so back button isn't polluted). `popstate` handler restores full state from URL.

---

## Performance Timeline

```
0ms      HTML arrives with 60 markets baked in (SSR)
         OR: localStorage warm cache renders 60 markets (revisit)
0ms      React hydrates, page is interactive
~50ms    WebSocket/SSE connection opens
~100ms   First realtime price patch applied
~120ms   Batch patch flush updates visible prices
~200ms   Background: next catalog page prefetched
~300ms   Tag facets loaded (for filter chips)
~500ms   Warm cache written to localStorage

User clicks market:
0ms      Market detail renders (data in catalog array)
0ms      URL updates (router.push, no reload)
~50ms    Stale candles shown from in-memory cache
~200ms   Fresh candles arrive from server
~300ms   Trades, activity, comments arrive (parallel)
60s      Candle polling refreshes chart data

User hits back:
0ms      popstate fires, detail closes
0ms      Catalog renders from memory (never unmounted)
0ms      Filters restored from URL params
```
