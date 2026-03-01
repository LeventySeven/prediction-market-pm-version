import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { listMirroredPolymarketMarkets } from "../../polymarket/mirror";
import type { Database } from "../../../types/database";

type FeedEventType = Database["public"]["Tables"]["user_events"]["Row"]["event_type"];
type MarketLiveFeedRow = Pick<
  Database["public"]["Tables"]["polymarket_market_live"]["Row"],
  "market_id" | "rolling_24h_volume" | "source_ts"
>;
type FeedEventRow = Pick<Database["public"]["Tables"]["user_events"]["Row"], "market_id" | "event_type">;

const feedItemOutput = z.object({
  marketId: z.string(),
  score: z.number(),
  reason: z.string(),
});

const feedOutput = z.object({
  apiVersion: z.literal("v1"),
  items: z.array(feedItemOutput),
  nextCursor: z.string().nullable(),
});

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const encodeCursor = (offset: number): string =>
  Buffer.from(String(Math.max(0, Math.floor(offset))), "utf8").toString("base64url");

const decodeCursor = (cursor?: string | null): number => {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = Number(decoded);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  } catch {
    return 0;
  }
};

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
    .input(
      z
        .object({
          cursor: z.string().nullable().optional(),
          limit: z.number().int().positive().max(30).optional(),
        })
        .optional()
    )
    .output(feedOutput)
    .query(async ({ ctx, input }) => {
      const limit = Math.max(1, Math.min(30, Number(input?.limit ?? 16)));
      const offset = decodeCursor(input?.cursor);

      const markets = await listMirroredPolymarketMarkets(ctx.supabaseService, {
        onlyOpen: true,
        limit: 700,
      });
      if (markets.length === 0) {
        return { apiVersion: "v1", items: [], nextCursor: null };
      }

      const marketIds = markets.map((m) => m.id);

      const liveRes = await ctx.supabaseService
        .from("polymarket_market_live")
        .select("market_id, rolling_24h_volume, source_ts")
        .in("market_id", marketIds);

      const liveByMarket = new Map<
        string,
        { rolling24hVolume: number; sourceTs: number }
      >();

      for (const row of (liveRes.data ?? []) as MarketLiveFeedRow[]) {
        const marketId = row.market_id.trim();
        if (!marketId) continue;
        const rolling = Number(row.rolling_24h_volume ?? 0);
        const ts = Date.parse(row.source_ts ?? "");
        liveByMarket.set(marketId, {
          rolling24hVolume: Number.isFinite(rolling) ? Math.max(0, rolling) : 0,
          sourceTs: Number.isFinite(ts) ? ts : 0,
        });
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
      const scored = markets
        .map((market) => {
          const affinityRaw = affinityByMarket.get(market.id) ?? 0;
          const affinityScore = maxAffinity > 0 ? clamp01(affinityRaw / maxAffinity) : 0;

          const live = liveByMarket.get(market.id);
          const popularityBase = live ? live.rolling24hVolume : market.volume;
          const popularityScore = clamp01(Math.log10(Math.max(0, popularityBase) + 1) / 6);

          const ageHours = live?.sourceTs ? Math.max(0, (now - live.sourceTs) / 3_600_000) : 72;
          const freshnessScore = clamp01(Math.exp(-ageHours / 72));

          const score = clamp01(affinityScore * 0.45 + popularityScore * 0.35 + freshnessScore * 0.2);

          const reason =
            affinityScore > 0.55
              ? "High affinity from recent activity"
              : popularityScore > 0.5
                ? "High market activity"
                : "Fresh market updates";

          return {
            marketId: market.id,
            score,
            reason,
            category: market.category ?? "general",
          };
        })
        .sort((a, b) => b.score - a.score);

      // Lightweight diversity pass: repeated categories gradually lose score.
      const categorySeen = new Map<string, number>();
      const diversified = scored
        .map((item) => {
          const seen = categorySeen.get(item.category) ?? 0;
          categorySeen.set(item.category, seen + 1);
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
        apiVersion: "v1",
        items,
        nextCursor,
      };
    }),
});
