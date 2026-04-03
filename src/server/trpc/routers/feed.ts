import "server-only";
import { publicProcedure, router } from "../trpc";
import type { Database } from "../../../types/database";
import { listEnabledProviders } from "../../venues/registry";
import { API_VERSION_V1, DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT } from "@/src/lib/constants";
import { feedOutput, getFeedInput, getActivityInput, activityOutput } from "@/src/lib/validations/feed";
import { encodeCursor, decodeCursor } from "@/src/lib/cursor";
import type { VenueProvider } from "../../venues/types";

type FeedEventType = Database["public"]["Tables"]["user_events"]["Row"]["event_type"];
type FeedEventRow = Pick<Database["public"]["Tables"]["user_events"]["Row"], "market_id" | "event_type">;

type FeedMarketCandidate = {
  marketId: string;
  primaryTag: string;
  fallbackVolume: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const eventWeight: Record<FeedEventType, number> = {
  view: 1,
  dwell: 2,
  click: 2,
  bookmark: 3,
  comment: 4,
  trade_intent: 5,
};

export const feedRouter = router({
  getForYou: publicProcedure
    .input(getFeedInput)
    .output(feedOutput)
    .query(async ({ ctx, input }) => {
      const limit = Math.max(1, Math.min(MAX_FEED_LIMIT, Number(input?.limit ?? DEFAULT_FEED_LIMIT)));
      const offset = decodeCursor(input?.cursor);

      const enabledProviders = new Set(listEnabledProviders());
      const providerList = Array.from(enabledProviders) as VenueProvider[];

      // Fetch all open markets from canonical market_catalog for all enabled providers (parallel)
      const candidates: FeedMarketCandidate[] = [];
      const freshnessByMarket = new Map<string, { sourceTs: number }>();

      const CATALOG_CHUNK_SIZE = 700;
      const catalogPromises = providerList.map((provider) =>
        (ctx.supabaseService as any)
          .from("market_catalog")
          .select("id, total_volume_usd, source_updated_at")
          .eq("provider", provider)
          .eq("state", "open")
          .limit(CATALOG_CHUNK_SIZE)
      );
      const catalogResults = await Promise.all(catalogPromises);
      for (const { data: catalogRows } of catalogResults) {
        for (const row of (catalogRows ?? []) as Array<Record<string, unknown>>) {
          const marketId = String(row.id ?? "").trim();
          if (!marketId) continue;
          const totalVolumeUsd = Number(row.total_volume_usd ?? 0);
          candidates.push({
            marketId,
            primaryTag: "general",
            fallbackVolume: Number.isFinite(totalVolumeUsd) ? totalVolumeUsd : 0,
          });
          const sourceTs = Date.parse(String(row.source_updated_at ?? ""));
          if (Number.isFinite(sourceTs)) {
            freshnessByMarket.set(marketId, { sourceTs });
          }
        }
      }

      if (candidates.length === 0) {
        return { apiVersion: API_VERSION_V1, items: [], nextCursor: null };
      }

      // Enrich live freshness + AI classifications in parallel
      const marketIds = candidates.map((c) => c.marketId);
      const [liveRes, classRes] = await Promise.all([
        (ctx.supabaseService as any)
          .from("market_live")
          .select("market_id, source_ts")
          .in("market_id", marketIds.slice(0, 500)),
        (ctx.supabaseService as any)
          .from("market_ai_classifications")
          .select("market_id, primary_tag")
          .in("market_id", marketIds.slice(0, 500)),
      ]);

      for (const row of ((liveRes.data ?? []) as Array<{ market_id: string; source_ts: string | null }>)) {
        const mid = String(row.market_id ?? "").trim();
        if (!mid) continue;
        const ts = Date.parse(row.source_ts ?? "");
        if (Number.isFinite(ts)) {
          const existing = freshnessByMarket.get(mid);
          if (!existing || ts > existing.sourceTs) {
            freshnessByMarket.set(mid, { sourceTs: ts });
          }
        }
      }

      const tagMap = new Map<string, string>();
      for (const row of ((classRes.data ?? []) as Array<{ market_id: string; primary_tag: string }>)) {
        tagMap.set(row.market_id, row.primary_tag);
      }
      for (const c of candidates) {
        const tag = tagMap.get(c.marketId);
        if (tag) c.primaryTag = tag;
      }

      const affinityByMarket = new Map<string, number>();
      if (ctx.authUser?.id) {
        const eventsRes = await ctx.supabaseService
          .from("user_events")
          .select("market_id, event_type")
          .eq("user_id", ctx.authUser.id)
          .order("created_at", { ascending: false })
          .limit(250);

        for (const row of (eventsRes.data ?? []) as FeedEventRow[]) {
          const marketId = row.market_id.trim();
          const eventType = row.event_type;
          if (!marketId || !(eventType in eventWeight)) continue;
          const next = (affinityByMarket.get(marketId) ?? 0) + eventWeight[eventType];
          affinityByMarket.set(marketId, next);
        }
      }

      let maxAffinity = 0;
      for (const value of affinityByMarket.values()) {
        if (value > maxAffinity) maxAffinity = value;
      }

      const now = Date.now();
      const scored = candidates
        .map((market) => {
          const affinityRaw = affinityByMarket.get(market.marketId) ?? 0;
          const affinityScore = maxAffinity > 0 ? clamp01(affinityRaw / maxAffinity) : 0;

          const freshness = freshnessByMarket.get(market.marketId);
          const popularityBase = market.fallbackVolume;
          const popularityScore = clamp01(Math.log10(Math.max(0, popularityBase) + 1) / 6);

          const ageHours = freshness?.sourceTs ? Math.max(0, (now - freshness.sourceTs) / 3_600_000) : 72;
          const freshnessScore = clamp01(Math.exp(-ageHours / 72));

          const score = clamp01(affinityScore * 0.45 + popularityScore * 0.35 + freshnessScore * 0.2);

          const reason =
            affinityScore > 0.55
              ? "High affinity from recent activity"
              : popularityScore > 0.5
                ? "High market activity"
                : "Fresh market updates";

          return {
            marketId: market.marketId,
            score,
            reason,
            primaryTag: market.primaryTag ?? "general",
          };
        })
        .sort((a, b) => b.score - a.score);

      // Lightweight diversity pass: repeated primary tags gradually lose score.
      const tagSeen = new Map<string, number>();
      const diversified = scored
        .map((item) => {
          const seen = tagSeen.get(item.primaryTag) ?? 0;
          tagSeen.set(item.primaryTag, seen + 1);
          const penalty = Math.min(0.2, seen * 0.04);
          return {
            marketId: item.marketId,
            score: clamp01(item.score - penalty),
            reason: item.reason,
          };
        })
        .sort((a, b) => b.score - a.score);

      const items = diversified.slice(offset, offset + limit);
      const nextOffset = offset + items.length;
      const nextCursor = nextOffset < diversified.length ? encodeCursor(nextOffset) : null;

      return {
        apiVersion: API_VERSION_V1,
        items,
        nextCursor,
      };
    }),

  getActivity: publicProcedure
    .input(getActivityInput)
    .output(activityOutput)
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 30;
      const supabase = ctx.supabaseService;

      // 1. Fetch recent comments, trade intents, and bookmarks in parallel
      const [commentsRes, tradesRes, bookmarksRes] = await Promise.all([
        supabase
          .from("market_comments")
          .select("id, market_id, user_id, body, created_at")
          .order("created_at", { ascending: false })
          .limit(limit),
        supabase
          .from("user_events")
          .select("id, market_id, user_id, event_value, created_at")
          .eq("event_type", "trade_intent")
          .not("user_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(limit),
        supabase
          .from("user_events")
          .select("id, market_id, user_id, created_at")
          .eq("event_type", "bookmark")
          .not("user_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);

      const comments = (commentsRes.data ?? []) as Array<{
        id: string;
        market_id: string;
        user_id: string;
        body: string;
        created_at: string;
      }>;
      const trades = (tradesRes.data ?? []) as Array<{
        id: number;
        market_id: string;
        user_id: string;
        event_value: number | null;
        created_at: string;
      }>;
      const bookmarks = (bookmarksRes.data ?? []) as Array<{
        id: number;
        market_id: string;
        user_id: string;
        created_at: string;
      }>;

      // 2. Collect unique user IDs and market IDs
      const userIdSet = new Set<string>();
      const marketIdSet = new Set<string>();

      for (const c of comments) {
        userIdSet.add(c.user_id);
        marketIdSet.add(c.market_id);
      }
      for (const t of trades) {
        if (t.user_id) { userIdSet.add(t.user_id); marketIdSet.add(t.market_id); }
      }
      for (const b of bookmarks) {
        if (b.user_id) { userIdSet.add(b.user_id); marketIdSet.add(b.market_id); }
      }

      const allUserIds = Array.from(userIdSet);
      const allMarketIds = Array.from(marketIdSet);

      // 3. Batch-fetch user profiles and market titles in parallel
      const [usersRes, marketsRes] = await Promise.all([
        allUserIds.length > 0
          ? supabase
              .from("users")
              .select("id, display_name, username, avatar_url")
              .in("id", allUserIds)
          : Promise.resolve({ data: [] }),
        allMarketIds.length > 0
          ? (supabase as any)
              .from("market_catalog")
              .select("id, title")
              .in("id", allMarketIds)
          : Promise.resolve({ data: [] }),
      ]);

      const userMap = new Map<string, { display_name: string | null; username: string | null; avatar_url: string | null }>();
      for (const u of (usersRes.data ?? []) as Array<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null }>) {
        userMap.set(u.id, u);
      }

      const marketTitleMap = new Map<string, string>();
      for (const m of (marketsRes.data ?? []) as Array<{ id: string; title: string | null }>) {
        if (m.title) marketTitleMap.set(m.id, m.title);
      }

      // 4. Build unified activity items
      type ActivityItem = {
        id: string;
        type: "comment" | "trade" | "bookmark";
        actorName: string;
        actorUsername: string | null;
        actorAvatarUrl: string | null;
        marketId: string;
        marketTitle: string | null;
        body: string | null;
        createdAt: string;
      };

      const resolveActor = (userId: string) => {
        const u = userMap.get(userId);
        return {
          actorName: u?.display_name || u?.username || "Anonymous",
          actorUsername: u?.username ?? null,
          actorAvatarUrl: u?.avatar_url ?? null,
        };
      };

      const items: ActivityItem[] = [];

      for (const c of comments) {
        const actor = resolveActor(c.user_id);
        items.push({
          id: `comment-${c.id}`,
          type: "comment",
          ...actor,
          marketId: c.market_id,
          marketTitle: marketTitleMap.get(c.market_id) ?? null,
          body: c.body,
          createdAt: c.created_at,
        });
      }

      for (const t of trades) {
        if (!t.user_id) continue;
        const actor = resolveActor(t.user_id);
        items.push({
          id: `trade-${t.id}`,
          type: "trade",
          ...actor,
          marketId: t.market_id,
          marketTitle: marketTitleMap.get(t.market_id) ?? null,
          body: null,
          createdAt: t.created_at,
        });
      }

      for (const b of bookmarks) {
        if (!b.user_id) continue;
        const actor = resolveActor(b.user_id);
        items.push({
          id: `bookmark-${b.id}`,
          type: "bookmark",
          ...actor,
          marketId: b.market_id,
          marketTitle: marketTitleMap.get(b.market_id) ?? null,
          body: null,
          createdAt: b.created_at,
        });
      }

      // 5. Sort by createdAt desc and take top `limit`
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return {
        apiVersion: API_VERSION_V1,
        items: items.slice(0, limit),
      };
    }),
});
