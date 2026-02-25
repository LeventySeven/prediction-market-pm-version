import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { generateMarketContext } from "../../ai/marketContextAgent";
import { getPolymarketMarketById, listPolymarketMarkets } from "../../polymarket/client";

const marketCategoryOutput = z.object({
  id: z.string(),
  labelRu: z.string(),
  labelEn: z.string(),
});

const marketOutcomeOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  slug: z.string(),
  title: z.string(),
  iconUrl: z.string().nullable(),
  chartColor: z.string().nullable().optional(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  probability: z.number(),
  price: z.number(),
});

const marketOutput = z.object({
  id: z.string(),
  titleRu: z.string(),
  titleEn: z.string(),
  description: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  imageUrl: z.string().optional(),
  state: z.enum(["open", "closed", "resolved", "cancelled"]),
  createdAt: z.string(),
  closesAt: z.string(),
  expiresAt: z.string(),
  marketType: z.enum(["binary", "multi_choice"]).optional(),
  resolvedOutcomeId: z.string().nullable().optional(),
  outcomes: z.array(marketOutcomeOutput).optional(),
  outcome: z.enum(["YES", "NO"]).nullable(),
  createdBy: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  categoryLabelRu: z.string().nullable().optional(),
  categoryLabelEn: z.string().nullable().optional(),
  settlementAsset: z.string().nullable().optional(),
  feeBps: z.number().nullable().optional(),
  liquidityB: z.number().nullable().optional(),
  priceYes: z.number(),
  priceNo: z.number(),
  volume: z.number(),
  chance: z.number().nullable().optional(),
  creatorName: z.string().nullable().optional(),
  creatorAvatarUrl: z.string().nullable().optional(),
});

const positionSummary = z.object({
  marketId: z.string(),
  outcome: z.enum(["YES", "NO"]).nullable(),
  outcomeId: z.string().nullable().optional(),
  outcomeTitle: z.string().nullable().optional(),
  shares: z.number(),
  avgEntryPrice: z.number().nullable(),
  marketTitleRu: z.string(),
  marketTitleEn: z.string(),
  marketState: z.enum(["open", "closed", "resolved", "cancelled"]),
  marketOutcome: z.enum(["YES", "NO"]).nullable(),
  marketResolvedOutcomeId: z.string().nullable().optional(),
  closesAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

const tradeSummary = z.object({
  id: z.string(),
  marketId: z.string(),
  action: z.enum(["buy", "sell"]),
  outcome: z.enum(["YES", "NO"]).nullable(),
  outcomeId: z.string().nullable().optional(),
  outcomeTitle: z.string().nullable().optional(),
  collateralGross: z.number(),
  fee: z.number(),
  collateralNet: z.number(),
  sharesDelta: z.number(),
  priceBefore: z.number(),
  priceAfter: z.number(),
  createdAt: z.string(),
  marketTitleRu: z.string(),
  marketTitleEn: z.string(),
  marketState: z.enum(["open", "closed", "resolved", "cancelled"]),
  marketOutcome: z.enum(["YES", "NO"]).nullable(),
  marketResolvedOutcomeId: z.string().nullable().optional(),
});

const marketBookmarkOutput = z.object({
  marketId: z.string(),
  createdAt: z.string(),
});

const priceCandleOutput = z.object({
  bucket: z.string(),
  outcomeId: z.string().nullable().optional(),
  outcomeTitle: z.string().nullable().optional(),
  outcomeColor: z.string().nullable().optional(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  tradesCount: z.number(),
});

const publicTradeOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  action: z.enum(["buy", "sell"]),
  outcome: z.enum(["YES", "NO"]).nullable(),
  outcomeId: z.string().nullable().optional(),
  outcomeTitle: z.string().nullable().optional(),
  collateralGross: z.number(),
  sharesDelta: z.number(),
  priceBefore: z.number(),
  priceAfter: z.number(),
  createdAt: z.string(),
});

const marketCommentOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  userId: z.string(),
  parentId: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
  authorName: z.string(),
  authorUsername: z.string().nullable(),
  authorAvatarUrl: z.string().nullable(),
  likesCount: z.number(),
  likedByMe: z.boolean(),
});

const myCommentOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  parentId: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
  marketTitleRu: z.string(),
  marketTitleEn: z.string(),
  likesCount: z.number(),
});

const marketContextOutput = z.object({
  marketId: z.string(),
  context: z.string(),
  sources: z.array(z.string()),
  updatedAt: z.string(),
  generated: z.boolean(),
});

const DEFAULT_CATEGORIES = [
  { id: "all", labelRu: "Все", labelEn: "All" },
  { id: "politics", labelRu: "Политика", labelEn: "Politics" },
  { id: "crypto", labelRu: "Крипто", labelEn: "Crypto" },
  { id: "sports", labelRu: "Спорт", labelEn: "Sports" },
  { id: "culture", labelRu: "Культура", labelEn: "Culture" },
] as const;

const t = (ru: string, en: string) => ({ ru, en });
const categoryLabelMap = new Map([
  ["politics", t("Политика", "Politics")],
  ["crypto", t("Крипто", "Crypto")],
  ["sports", t("Спорт", "Sports")],
  ["culture", t("Культура", "Culture")],
  ["business", t("Бизнес", "Business")],
]);

const mapPolymarketMarket = (market: Awaited<ReturnType<typeof getPolymarketMarketById>> extends infer T ? Exclude<T, null> : never) => {
  const outcomes = market.outcomes.map((o) => ({
    id: o.id,
    marketId: market.id,
    slug: o.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    title: o.title,
    iconUrl: null,
    chartColor: null,
    sortOrder: o.sortOrder,
    isActive: true,
    probability: o.probability,
    price: o.price,
  }));
  const yes = outcomes[0];
  const no = outcomes[1];
  const categoryKey = (market.category || "all").toLowerCase();
  const labels = categoryLabelMap.get(categoryKey) ?? t("Разное", "General");

  let resolved: "YES" | "NO" | null = null;
  if (market.state === "resolved" && market.resolvedOutcomeTitle) {
    const normalized = market.resolvedOutcomeTitle.toLowerCase();
    if (normalized.includes("yes")) resolved = "YES";
    if (normalized.includes("no")) resolved = "NO";
  }

  return {
    id: market.id,
    titleRu: market.title,
    titleEn: market.title,
    description: market.description,
    source: market.sourceUrl,
    imageUrl: market.imageUrl ?? "",
    state: market.state,
    createdAt: market.createdAt,
    closesAt: market.closesAt,
    expiresAt: market.expiresAt,
    marketType: outcomes.length > 2 ? ("multi_choice" as const) : ("binary" as const),
    resolvedOutcomeId: null,
    outcomes,
    outcome: resolved,
    createdBy: null,
    categoryId: categoryKey,
    categoryLabelRu: labels.ru,
    categoryLabelEn: labels.en,
    settlementAsset: "USD",
    feeBps: null,
    liquidityB: null,
    priceYes: yes ? yes.price : 0.5,
    priceNo: no ? no.price : 0.5,
    volume: market.volume,
    chance: yes ? yes.probability * 100 : 50,
    creatorName: null,
    creatorAvatarUrl: null,
  };
};

const tradeOnPolymarketError = () =>
  new TRPCError({
    code: "BAD_REQUEST",
    message: "TRADE_ON_POLYMARKET",
  });

export const marketRouter = router({
  listCategories: publicProcedure.output(z.array(marketCategoryOutput)).query(async () => {
    return DEFAULT_CATEGORIES.map((c) => ({ id: c.id, labelRu: c.labelRu, labelEn: c.labelEn }));
  }),

  listMarkets: publicProcedure
    .input(z.object({ onlyOpen: z.boolean().optional() }).optional())
    .output(z.array(marketOutput))
    .query(async ({ input }) => {
      const onlyOpen = input?.onlyOpen ?? false;
      const rows = await listPolymarketMarkets(250);
      const mapped = rows.map(mapPolymarketMarket);
      return onlyOpen ? mapped.filter((m) => m.state === "open") : mapped;
    }),

  getMarket: publicProcedure
    .input(z.object({ marketId: z.string().min(1) }))
    .output(marketOutput)
    .query(async ({ input }) => {
      const row = await getPolymarketMarketById(input.marketId);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }
      return mapPolymarketMarket(row);
    }),

  generateMarketContext: publicProcedure
    .input(z.object({ marketId: z.string().min(1) }))
    .output(marketContextOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService } = ctx;
      const market = await getPolymarketMarketById(input.marketId);
      if (!market) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }

      const existing = await (supabaseService as any)
        .from("market_context")
        .select("market_id, context, sources, updated_at")
        .eq("market_id", input.marketId)
        .maybeSingle();
      if (!existing.error && existing.data?.context) {
        const src = Array.isArray(existing.data.sources) ? existing.data.sources.map(String) : [];
        return {
          marketId: String(existing.data.market_id),
          context: String(existing.data.context),
          sources: src,
          updatedAt: String(existing.data.updated_at),
          generated: false,
        };
      }

      const generated = await generateMarketContext({
        marketId: input.marketId,
        title: market.title,
        description: market.description,
        source: market.sourceUrl,
      });
      const updatedAt = new Date().toISOString();
      const upsert = await (supabaseService as any).from("market_context").upsert(
        {
          market_id: input.marketId,
          context: generated.context,
          sources: generated.sources,
          updated_at: updatedAt,
        },
        { onConflict: "market_id" }
      );
      if (upsert.error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: upsert.error.message });
      }
      return {
        marketId: input.marketId,
        context: generated.context,
        sources: generated.sources,
        updatedAt,
        generated: true,
      };
    }),

  creatorMarketMeta: publicProcedure
    .input(z.object({ marketId: z.string().min(1) }))
    .output(z.object({ hasBets: z.boolean() }))
    .query(async () => ({ hasBets: true })),

  placeBet: publicProcedure
    .input(
      z.object({
        marketId: z.string().min(1),
        side: z.enum(["YES", "NO"]).optional(),
        outcomeId: z.string().optional(),
        amount: z.number().positive(),
      })
    )
    .output(
      z.object({
        tradeId: z.string(),
        newBalanceMinor: z.number(),
        sharesBought: z.number(),
        priceBefore: z.number(),
        priceAfter: z.number(),
      })
    )
    .mutation(async () => {
      throw tradeOnPolymarketError();
    }),

  prepareBet: publicProcedure
    .input(
      z.object({
        marketId: z.string().min(1),
        side: z.enum(["YES", "NO"]),
        amount: z.number().positive(),
        assetCode: z.enum(["USDC"]),
        userPubkey: z.string().min(16),
      })
    )
    .output(z.object({ solanaCluster: z.enum(["devnet", "testnet", "mainnet-beta"]), txBase64: z.string() }))
    .mutation(async () => {
      throw tradeOnPolymarketError();
    }),

  finalizeBet: publicProcedure
    .input(z.object({ marketId: z.string().min(1), signature: z.string().min(1) }))
    .output(
      z.object({
        tradeId: z.string(),
        txSig: z.string(),
        newBalanceMinor: z.number(),
        sharesBought: z.number(),
        priceBefore: z.number(),
        priceAfter: z.number(),
      })
    )
    .mutation(async () => {
      throw tradeOnPolymarketError();
    }),

  prepareSell: publicProcedure
    .input(
      z.object({
        marketId: z.string().min(1),
        side: z.enum(["YES", "NO"]),
        shares: z.number().positive(),
        assetCode: z.enum(["USDC"]),
        userPubkey: z.string().min(16),
      })
    )
    .output(z.object({ solanaCluster: z.enum(["devnet", "testnet", "mainnet-beta"]), txBase64: z.string() }))
    .mutation(async () => {
      throw tradeOnPolymarketError();
    }),

  finalizeSell: publicProcedure
    .input(z.object({ marketId: z.string().min(1), signature: z.string().min(1) }))
    .output(
      z.object({
        tradeId: z.string(),
        txSig: z.string(),
        payoutNetMinor: z.number(),
        newBalanceMinor: z.number(),
        sharesSold: z.number(),
        priceBefore: z.number(),
        priceAfter: z.number(),
      })
    )
    .mutation(async () => {
      throw tradeOnPolymarketError();
    }),

  prepareClaim: publicProcedure
    .input(
      z.object({
        marketId: z.string().min(1),
        assetCode: z.enum(["USDC"]),
        userPubkey: z.string().min(16),
      })
    )
    .output(z.object({ solanaCluster: z.enum(["devnet", "testnet", "mainnet-beta"]), txBase64: z.string() }))
    .mutation(async () => {
      throw tradeOnPolymarketError();
    }),

  finalizeClaim: publicProcedure
    .input(z.object({ marketId: z.string().min(1), signature: z.string().min(1) }))
    .output(
      z.object({
        txSig: z.string(),
        newBalanceMinor: z.number(),
      })
    )
    .mutation(async () => {
      throw tradeOnPolymarketError();
    }),

  sellPosition: publicProcedure
    .input(
      z.object({
        marketId: z.string().min(1),
        side: z.enum(["YES", "NO"]).optional(),
        outcomeId: z.string().optional(),
        shares: z.number().positive(),
      })
    )
    .output(
      z.object({
        tradeId: z.string(),
        payoutNetMinor: z.number(),
        newBalanceMinor: z.number(),
        sharesSold: z.number(),
        priceBefore: z.number(),
        priceAfter: z.number(),
      })
    )
    .mutation(async () => {
      throw tradeOnPolymarketError();
    }),

  resolveMarket: publicProcedure
    .input(
      z.object({
        marketId: z.string().min(1),
        outcome: z.enum(["YES", "NO"]).optional(),
        winningOutcomeId: z.string().optional(),
      })
    )
    .output(
      z.object({
        marketId: z.string(),
        outcome: z.string(),
        totalPayoutMinor: z.number(),
        winnersCount: z.number(),
      })
    )
    .mutation(async () => {
      throw tradeOnPolymarketError();
    }),

  myPositions: publicProcedure.output(z.array(positionSummary)).query(async () => []),
  myTrades: publicProcedure.output(z.array(tradeSummary)).query(async () => []),
  myMarkets: publicProcedure.output(z.array(marketOutput.extend({ hasBets: z.boolean() }))).query(async () => []),

  myBookmarks: publicProcedure
    .output(z.array(marketBookmarkOutput))
    .query(async ({ ctx }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const { data, error } = await (supabaseService as any)
        .from("market_bookmarks")
        .select("market_id, created_at")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return (data ?? []).map((r: any) => ({
        marketId: String(r.market_id),
        createdAt: new Date(String(r.created_at)).toISOString(),
      }));
    }),

  setBookmark: publicProcedure
    .input(z.object({ marketId: z.string().min(1), bookmarked: z.boolean() }))
    .output(z.object({ marketId: z.string(), bookmarked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      if (input.bookmarked) {
        const ins = await (supabaseService as any).from("market_bookmarks").insert({
          user_id: authUser.id,
          market_id: input.marketId,
        });
        if (ins.error && !String(ins.error.message).toLowerCase().includes("duplicate")) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: ins.error.message });
        }
      } else {
        const del = await (supabaseService as any)
          .from("market_bookmarks")
          .delete()
          .eq("user_id", authUser.id)
          .eq("market_id", input.marketId);
        if (del.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: del.error.message });
      }
      return { marketId: input.marketId, bookmarked: input.bookmarked };
    }),

  myWalletBalance: publicProcedure
    .output(
      z.object({
        balanceMinor: z.number(),
        balanceMajor: z.number(),
        assetCode: z.string(),
        decimals: z.number(),
      })
    )
    .query(async () => ({
      balanceMinor: 0,
      balanceMajor: 0,
      assetCode: "USD",
      decimals: 2,
    })),

  getPriceCandles: publicProcedure
    .input(z.object({ marketId: z.string().min(1), limit: z.number().int().positive().max(1000).optional() }))
    .output(z.array(priceCandleOutput))
    .query(async ({ input }) => {
      const market = await getPolymarketMarketById(input.marketId);
      if (!market) return [];
      const yes = market.outcomes[0]?.price ?? 0.5;
      return [
        {
          bucket: market.createdAt,
          outcomeId: null,
          outcomeTitle: null,
          outcomeColor: null,
          open: yes,
          high: yes,
          low: yes,
          close: yes,
          volume: market.volume,
          tradesCount: 0,
        },
        {
          bucket: new Date().toISOString(),
          outcomeId: null,
          outcomeTitle: null,
          outcomeColor: null,
          open: yes,
          high: yes,
          low: yes,
          close: yes,
          volume: market.volume,
          tradesCount: 0,
        },
      ];
    }),

  setOutcomeChartColor: publicProcedure
    .input(z.object({ outcomeId: z.string().min(1), chartColor: z.string().nullable() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async () => ({ ok: true })),

  getPublicTrades: publicProcedure
    .input(z.object({ marketId: z.string().min(1), limit: z.number().int().positive().max(200).optional() }))
    .output(z.array(publicTradeOutput))
    .query(async () => []),

  getMarketComments: publicProcedure
    .input(z.object({ marketId: z.string().min(1), limit: z.number().int().positive().max(200).optional() }))
    .output(z.array(marketCommentOutput))
    .query(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      const { data: comments, error } = await (supabaseService as any)
        .from("market_comments")
        .select("id, market_id, user_id, parent_id, body, created_at")
        .eq("market_id", input.marketId)
        .order("created_at", { ascending: true })
        .limit(input.limit ?? 100);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const commentRows = (comments ?? []) as any[];
      const userIds = Array.from(new Set(commentRows.map((c) => String(c.user_id))));
      const [{ data: users }, { data: likes }] = await Promise.all([
        userIds.length > 0
          ? (supabaseService as any)
              .from("users")
              .select("id, display_name, username, avatar_url, telegram_photo_url")
              .in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        commentRows.length > 0
          ? (supabaseService as any)
              .from("market_comment_likes")
              .select("comment_id, user_id")
              .in("comment_id", commentRows.map((c) => String(c.id)))
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const usersById = new Map((users ?? []).map((u: any) => [String(u.id), u]));
      const likesByComment = new Map<string, Set<string>>();
      for (const like of likes ?? []) {
        const commentId = String((like as any).comment_id);
        const userId = String((like as any).user_id);
        const set = likesByComment.get(commentId) ?? new Set<string>();
        set.add(userId);
        likesByComment.set(commentId, set);
      }

      return commentRows.map((c) => {
        const author = usersById.get(String(c.user_id)) as any;
        const likeSet = likesByComment.get(String(c.id)) ?? new Set<string>();
        return {
          id: String(c.id),
          marketId: String(c.market_id),
          userId: String(c.user_id),
          parentId: c.parent_id ? String(c.parent_id) : null,
          body: String(c.body ?? ""),
          createdAt: new Date(String(c.created_at)).toISOString(),
          authorName: String(author?.display_name ?? author?.username ?? "User"),
          authorUsername: author?.username ? String(author.username) : null,
          authorAvatarUrl: (author?.avatar_url ?? author?.telegram_photo_url ?? null) as string | null,
          likesCount: likeSet.size,
          likedByMe: authUser ? likeSet.has(authUser.id) : false,
        };
      });
    }),

  postMarketComment: publicProcedure
    .input(z.object({ marketId: z.string().min(1), body: z.string().min(1).max(2000), parentId: z.string().nullable().optional() }))
    .output(marketCommentOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const body = input.body.trim();
      if (!body) throw new TRPCError({ code: "BAD_REQUEST", message: "Comment body is required" });

      const inserted = await (supabaseService as any)
        .from("market_comments")
        .insert({
          market_id: input.marketId,
          user_id: authUser.id,
          parent_id: input.parentId ?? null,
          body,
        })
        .select("id, market_id, user_id, parent_id, body, created_at")
        .single();
      if (inserted.error || !inserted.data) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: inserted.error?.message ?? "Failed to post comment" });
      }

      const profile = await (supabaseService as any)
        .from("users")
        .select("display_name, username, avatar_url, telegram_photo_url")
        .eq("id", authUser.id)
        .maybeSingle();
      const p = profile.data ?? {};
      return {
        id: String(inserted.data.id),
        marketId: String(inserted.data.market_id),
        userId: String(inserted.data.user_id),
        parentId: inserted.data.parent_id ? String(inserted.data.parent_id) : null,
        body: String(inserted.data.body ?? body),
        createdAt: new Date(String(inserted.data.created_at)).toISOString(),
        authorName: String(p.display_name ?? p.username ?? authUser.username ?? "User"),
        authorUsername: p.username ? String(p.username) : null,
        authorAvatarUrl: (p.avatar_url ?? p.telegram_photo_url ?? null) as string | null,
        likesCount: 0,
        likedByMe: false,
      };
    }),

  toggleMarketCommentLike: publicProcedure
    .input(z.object({ commentId: z.string().min(1) }))
    .output(z.object({ commentId: z.string(), liked: z.boolean(), likesCount: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const existing = await (supabaseService as any)
        .from("market_comment_likes")
        .select("comment_id, user_id")
        .eq("comment_id", input.commentId)
        .eq("user_id", authUser.id)
        .maybeSingle();
      if (existing.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: existing.error.message });

      const liked = !existing.data;
      if (liked) {
        const ins = await (supabaseService as any).from("market_comment_likes").insert({
          comment_id: input.commentId,
          user_id: authUser.id,
        });
        if (ins.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: ins.error.message });
      } else {
        const del = await (supabaseService as any)
          .from("market_comment_likes")
          .delete()
          .eq("comment_id", input.commentId)
          .eq("user_id", authUser.id);
        if (del.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: del.error.message });
      }

      const countRes = await (supabaseService as any)
        .from("market_comment_likes")
        .select("comment_id", { count: "exact", head: true })
        .eq("comment_id", input.commentId);
      return {
        commentId: input.commentId,
        liked,
        likesCount: Number(countRes.count ?? 0),
      };
    }),

  myComments: publicProcedure
    .input(z.object({ limit: z.number().int().positive().max(500).optional() }).optional())
    .output(z.array(myCommentOutput))
    .query(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const limit = input?.limit ?? 100;
      const { data, error } = await (supabaseService as any)
        .from("market_comments")
        .select("id, market_id, parent_id, body, created_at")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => String(r.market_id))));
      const markets = await Promise.all(ids.map(async (id) => [id, await getPolymarketMarketById(id)] as const));
      const marketsById = new Map(markets);

      const likeCountsRes = await (supabaseService as any)
        .from("market_comment_likes")
        .select("comment_id")
        .in("comment_id", rows.map((r) => String(r.id)));
      const likesByComment = new Map<string, number>();
      for (const like of likeCountsRes.data ?? []) {
        const key = String((like as any).comment_id);
        likesByComment.set(key, (likesByComment.get(key) ?? 0) + 1);
      }

      return rows.map((r) => {
        const market = marketsById.get(String(r.market_id));
        const title = market?.title ?? "Market";
        return {
          id: String(r.id),
          marketId: String(r.market_id),
          parentId: r.parent_id ? String(r.parent_id) : null,
          body: String(r.body ?? ""),
          createdAt: new Date(String(r.created_at)).toISOString(),
          marketTitleRu: title,
          marketTitleEn: title,
          likesCount: likesByComment.get(String(r.id)) ?? 0,
        };
      });
    }),

  createMarket: publicProcedure
    .input(z.any())
    .output(z.object({ id: z.string(), titleRu: z.string().nullable(), titleEn: z.string().nullable() }))
    .mutation(async () => {
      throw tradeOnPolymarketError();
    }),

  updateMarket: publicProcedure
    .input(z.any())
    .output(z.object({ id: z.string(), titleRu: z.string().nullable(), titleEn: z.string().nullable() }))
    .mutation(async () => {
      throw tradeOnPolymarketError();
    }),

  deleteMarket: publicProcedure
    .input(z.object({ marketId: z.string().min(1) }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async () => {
      throw tradeOnPolymarketError();
    }),
});

