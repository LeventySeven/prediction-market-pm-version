import "server-only";
import { publicProcedure, router } from "../trpc";
import type { Database } from "../../../types/database";
import { listEnabledProviders } from "../../venues/registry";
import { API_VERSION_V1, DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT } from "@/src/lib/constants";
import { feedOutput, getFeedInput } from "@/src/lib/validations/feed";
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
});
