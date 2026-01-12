import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { calculateLMSRPrices, toMajorUnits } from "../helpers/pricing";
import type { Database } from "../../../types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type SupabaseDbClient = SupabaseClient<Database, "public">;

// Default asset for the platform
const DEFAULT_ASSET = "VCOIN";
const VCOIN_DECIMALS = 6;

type MarketRow = Database["public"]["Tables"]["markets"]["Row"];
type AmmStateRow = Database["public"]["Tables"]["market_amm_state"]["Row"];
type PositionRow = Database["public"]["Tables"]["positions"]["Row"];
type TradeRow = Database["public"]["Tables"]["trades"]["Row"];

// We intentionally do NOT rely on markets.category_label_ru/en being present in the DB schema
// (some deployments may not have these columns). Make them optional in the type used for reads.
type MarketRowForRead = Omit<MarketRow, "category_label_ru" | "category_label_en"> & {
  category_label_ru?: string | null;
  category_label_en?: string | null;
};

type MarketWithAmm = MarketRowForRead & {
  market_amm_state: AmmStateRow | null;
};

type WalletBalanceRowBase = Database["public"]["Tables"]["wallet_balances"]["Row"];
type WalletBalanceRow = Pick<WalletBalanceRowBase, "balance_minor">;

type PositionWithMarket = PositionRow & {
  markets: Pick<MarketRow, "title_rus" | "title_eng" | "state" | "resolve_outcome" | "closes_at" | "expires_at"> | null;
};

type TradeWithMarket = TradeRow & {
  markets: Pick<MarketRow, "title_rus" | "title_eng" | "state" | "resolve_outcome"> | null;
};

// RPC return types
type PlaceBetResult = Database["public"]["Functions"]["place_bet_tx"]["Returns"];
type SellPositionResult = Database["public"]["Functions"]["sell_position_tx"]["Returns"];
type ResolveMarketResult = Database["public"]["Functions"]["resolve_market_service_tx"]["Returns"];
type MarketCommentPublicRow = Database["public"]["Views"]["market_comments_public"]["Row"];
type MarketCommentInsert = Database["public"]["Tables"]["market_comments"]["Insert"];
type MarketCommentLikeRow = Database["public"]["Tables"]["market_comment_likes"]["Row"];
type MarketBookmarkRow = Database["public"]["Tables"]["market_bookmarks"]["Row"];
type MarketCategoryRow = Database["public"]["Tables"]["market_categories"]["Row"];

const deriveVolumeMajor = (amm: AmmStateRow | null, feeBps?: number | null) => {
  if (!amm) return 0;
  const feeMinor = Number(amm.fee_accumulated_minor ?? 0);
  const bps = Number(feeBps ?? 0);
  if (!Number.isFinite(feeMinor) || feeMinor <= 0 || !Number.isFinite(bps) || bps <= 0) {
    return 0;
  }
  const volumeMinor = (feeMinor * 10000) / bps;
  return toMajorUnits(volumeMinor, VCOIN_DECIMALS);
};

const mapMarketRow = (
  row: MarketWithAmm,
  categoryLabelsById?: Map<string, Pick<MarketCategoryRow, "label_ru" | "label_en">>,
  volumeMajorOverride?: number
) => {
  const amm = row.market_amm_state;
  const { priceYes, priceNo } = amm
    ? calculateLMSRPrices(Number(amm.q_yes), Number(amm.q_no), Number(amm.b))
    : { priceYes: 0.5, priceNo: 0.5 };

  const categoryId = row.category_id ?? null;
  const categoryLabels = categoryId ? categoryLabelsById?.get(categoryId) : undefined;

  return {
    id: row.id,
    titleRu: row.title_rus ?? row.title_eng,
    titleEn: row.title_eng,
    description: row.description,
    imageUrl: row.image_url ?? "",
    state: row.state,
    closesAt: new Date(row.closes_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    outcome: row.resolve_outcome,
    createdBy: row.created_by ?? null,
    categoryId,
    // Some DBs may not have category_label_* columns (they were referenced in code but not migrated).
    // Prefer current labels from market_categories; fall back to existing columns if present.
    categoryLabelRu: categoryLabels?.label_ru ?? row.category_label_ru ?? null,
    categoryLabelEn: categoryLabels?.label_en ?? row.category_label_en ?? null,
    settlementAsset: row.settlement_asset_code,
    feeBps: row.fee_bps,
    liquidityB: Number(row.liquidity_b),
    priceYes,
    priceNo,
    volume: typeof volumeMajorOverride === "number" && Number.isFinite(volumeMajorOverride)
      ? volumeMajorOverride
      : deriveVolumeMajor(amm, row.fee_bps),
  };
};

const mapPositionRow = (row: PositionWithMarket, decimals: number) => {
  return {
    marketId: row.market_id,
    outcome: row.outcome,
    shares: Number(row.shares),
    avgEntryPrice: row.avg_entry_price ? Number(row.avg_entry_price) : null,
    marketTitleRu: row.markets?.title_rus ?? row.markets?.title_eng ?? "",
    marketTitleEn: row.markets?.title_eng ?? "",
    marketState: row.markets?.state ?? "open",
    marketOutcome: row.markets?.resolve_outcome ?? null,
    closesAt: row.markets?.closes_at ? new Date(row.markets.closes_at).toISOString() : null,
    expiresAt: row.markets?.expires_at ? new Date(row.markets.expires_at).toISOString() : null,
  };
};

const mapTradeRow = (row: TradeWithMarket, decimals: number) => {
  return {
    id: row.id,
    marketId: row.market_id,
    action: row.action,
    outcome: row.outcome,
    collateralGross: toMajorUnits(Number(row.collateral_gross_minor), decimals),
    fee: toMajorUnits(Number(row.fee_minor), decimals),
    collateralNet: toMajorUnits(Number(row.collateral_net_minor), decimals),
    sharesDelta: Number(row.shares_delta),
    priceBefore: Number(row.price_before),
    priceAfter: Number(row.price_after),
    createdAt: new Date(row.created_at).toISOString(),
    marketTitleRu: row.markets?.title_rus ?? row.markets?.title_eng ?? "",
    marketTitleEn: row.markets?.title_eng ?? "",
    marketState: row.markets?.state ?? "open",
    marketOutcome: row.markets?.resolve_outcome ?? null,
  };
};

// Zod schemas for output
const positionSummary = z.object({
  marketId: z.string(),
  outcome: z.enum(["YES", "NO"]),
  shares: z.number(),
  avgEntryPrice: z.number().nullable(),
  marketTitleRu: z.string(),
  marketTitleEn: z.string(),
  marketState: z.string(),
  marketOutcome: z.enum(["YES", "NO"]).nullable(),
  closesAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

const tradeSummary = z.object({
  id: z.string(),
  marketId: z.string(),
  action: z.enum(["buy", "sell"]),
  outcome: z.enum(["YES", "NO"]),
  collateralGross: z.number(),
  fee: z.number(),
  collateralNet: z.number(),
  sharesDelta: z.number(),
  priceBefore: z.number(),
  priceAfter: z.number(),
  createdAt: z.string(),
  marketTitleRu: z.string(),
  marketTitleEn: z.string(),
  marketState: z.string(),
  marketOutcome: z.enum(["YES", "NO"]).nullable(),
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

const marketOutput = z.object({
  id: z.string(),
  titleRu: z.string(),
  titleEn: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string(),
  state: z.string(),
  closesAt: z.string(),
  expiresAt: z.string(),
  outcome: z.enum(["YES", "NO"]).nullable(),
  createdBy: z.string().nullable(),
  categoryId: z.string().nullable(),
  categoryLabelRu: z.string().nullable(),
  categoryLabelEn: z.string().nullable(),
  settlementAsset: z.string(),
  feeBps: z.number(),
  liquidityB: z.number(),
  priceYes: z.number(),
  priceNo: z.number(),
  volume: z.number(),
});

const marketCategoryOutput = z.object({
  id: z.string(),
  labelRu: z.string(),
  labelEn: z.string(),
});

const marketBookmarkOutput = z.object({
  marketId: z.string(),
  createdAt: z.string(),
});

export const marketRouter = router({
  listCategories: publicProcedure
    .output(z.array(marketCategoryOutput))
    .query(async ({ ctx }) => {
      const { supabaseService } = ctx;
      const { data, error } = await supabaseService
        .from("market_categories")
        .select("id, label_ru, label_en, is_enabled, sort_order")
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows = (data ?? []) as Pick<MarketCategoryRow, "id" | "label_ru" | "label_en">[];
      return rows.map((r) => ({ id: r.id, labelRu: r.label_ru, labelEn: r.label_en }));
    }),

  listMarkets: publicProcedure
    .input(z.object({ onlyOpen: z.boolean().optional() }).optional())
    .output(z.array(marketOutput))
    .query(async ({ ctx, input }) => {
      const { supabase, supabaseService } = ctx;
      const onlyOpen = input?.onlyOpen ?? false;

      let query = supabase
        .from("markets")
        .select(`
          id, title_rus, title_eng, description, image_url, state, closes_at, expires_at, created_by,
          resolve_outcome, settlement_asset_code, fee_bps, liquidity_b, amm_type, created_at,
          category_id,
          market_amm_state (market_id, b, q_yes, q_no, last_price_yes, fee_accumulated_minor, updated_at)
        `)
        .order("created_at", { ascending: false });

      if (onlyOpen) {
        query = query.eq("state", "open");
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows: MarketWithAmm[] = data ?? [];

      // Compute market volume from candle aggregates (always use market_price_candles).
      const volumeByMarketId = new Map<string, number>();
      if (rows.length > 0) {
        const marketIds = rows.map((r) => r.id);
        const { data: candles, error: candlesError } = await supabase
          .from("market_price_candles")
          .select("market_id, volume_minor")
          .in("market_id", marketIds)
          .limit(20000);

        if (!candlesError && candles) {
          type CandleRow = Pick<
            Database["public"]["Tables"]["market_price_candles"]["Row"],
            "market_id" | "volume_minor"
          >;
          (candles as CandleRow[]).forEach((c) => {
            const key = String(c.market_id);
            const prev = volumeByMarketId.get(key) ?? 0;
            const minor = Number(c.volume_minor ?? 0);
            if (!Number.isFinite(minor) || minor <= 0) return;
            volumeByMarketId.set(key, prev + toMajorUnits(minor, VCOIN_DECIMALS));
          });
        }
      }

      // Derive category labels from market_categories to avoid relying on category_label_* columns.
      const categoryIds = Array.from(
        new Set(rows.map((r) => r.category_id).filter((v): v is string => typeof v === "string" && v.length > 0))
      );

      const labelsById = new Map<string, Pick<MarketCategoryRow, "label_ru" | "label_en">>();
      if (categoryIds.length > 0) {
        const { data: cats, error: catsError } = await supabaseService
          .from("market_categories")
          .select("id, label_ru, label_en")
          .in("id", categoryIds);
        if (!catsError) {
          const typed = (cats ?? []) as Array<Pick<MarketCategoryRow, "id" | "label_ru" | "label_en">>;
          typed.forEach((c) => labelsById.set(c.id, { label_ru: c.label_ru, label_en: c.label_en }));
        }
      }

      return rows.map((r) => mapMarketRow(r, labelsById, volumeByMarketId.get(r.id)));
    }),

  getMarket: publicProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .output(marketOutput)
    .query(async ({ ctx, input }) => {
      const { supabase, supabaseService } = ctx;

      const { data, error } = await supabase
        .from("markets")
        .select(`
          id, title_rus, title_eng, description, image_url, state, closes_at, expires_at, created_by,
          resolve_outcome, settlement_asset_code, fee_bps, liquidity_b, amm_type, created_at,
          category_id,
          market_amm_state (market_id, b, q_yes, q_no, last_price_yes, fee_accumulated_minor, updated_at)
        `)
        .eq("id", input.marketId)
        .single();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }

      const row: MarketWithAmm = data;

      // Compute total volume from candle aggregates (always use market_price_candles).
      let volumeMajor: number | undefined = undefined;
      const { data: candles, error: candlesError } = await supabase
        .from("market_price_candles")
        .select("volume_minor")
        .eq("market_id", input.marketId)
        .limit(20000);
      if (!candlesError && candles) {
        type CandleRow = Pick<Database["public"]["Tables"]["market_price_candles"]["Row"], "volume_minor">;
        const totalMinor = (candles as CandleRow[]).reduce((acc, c) => {
          const n = Number(c.volume_minor ?? 0);
          return Number.isFinite(n) && n > 0 ? acc + n : acc;
        }, 0);
        if (totalMinor > 0) {
          volumeMajor = toMajorUnits(totalMinor, VCOIN_DECIMALS);
        }
      }
      const labelsById = new Map<string, Pick<MarketCategoryRow, "label_ru" | "label_en">>();
      const categoryId = row.category_id;
      if (typeof categoryId === "string" && categoryId.length > 0) {
        const { data: cat, error: catError } = await supabaseService
          .from("market_categories")
          .select("label_ru, label_en")
          .eq("id", categoryId)
          .maybeSingle();
        if (!catError && cat) {
          const typed = cat as Pick<MarketCategoryRow, "label_ru" | "label_en">;
          labelsById.set(categoryId, typed);
        }
      }

      return mapMarketRow(row, labelsById, volumeMajor);
    }),

  /**
   * Place a bet (buy shares) - calls RPC that uses auth.uid()
   */
  placeBet: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        side: z.enum(["YES", "NO"]),
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
    .mutation(async ({ ctx, input }) => {
      const { supabase, supabaseService, authUser, cookies } = ctx;
      const { marketId, side, amount } = input;

      if (!authUser) {
        // Log for debugging
        const hasAuthToken = Boolean(cookies?.auth_token);
        const hasSbAccessToken = Boolean(cookies?.sb_access_token);
        console.warn("[placeBet] authUser is null", { hasAuthToken, hasSbAccessToken, cookiesKeys: cookies ? Object.keys(cookies) : [] });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      // Ensure we have a Supabase session for the RPC call (it uses auth.uid() internally).
      // If the user client doesn't have a session, try to refresh it or use service client with user_id override.
      // For now, try the user client first. If it fails with NOT_AUTHENTICATED, we'll handle it below.
      let client = supabase as SupabaseDbClient;
      const hasSbSession = Boolean(cookies?.sb_access_token);
      
      if (!hasSbSession) {
        // No Supabase session cookie - the RPC will fail with NOT_AUTHENTICATED.
        // This shouldn't happen if login worked correctly, but log it for debugging.
        console.warn("[placeBet] No Supabase session cookie found", { userId: authUser.id });
      }

      // Call the RPC - it uses auth.uid() internally, no user_id passed
      const { data, error } = await client.rpc("place_bet_tx", {
        p_market_id: marketId,
        p_side: side,
        p_amount: amount,
      });

      if (error) {
        // Map common DB errors to user-friendly messages
        const msg = (error.message || "").toUpperCase();
        if (msg.includes("NOT_AUTHENTICATED") || msg.includes("UNAUTHORIZED")) {
          console.error("[placeBet] Supabase RPC auth error", { error: error.message, userId: authUser.id, hasSbSession });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated - please log in again" });
        }
        if (msg.includes("INSUFFICIENT_BALANCE")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "INSUFFICIENT_BALANCE" });
        }
        if (msg.includes("MARKET_CLOSED") || msg.includes("MARKET_NOT_OPEN")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_CLOSED" });
        }
        if (msg.includes("MARKET_RESOLVED")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_RESOLVED" });
        }
        if (msg.includes("MARKET_NOT_FOUND")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
        }
        if (msg.includes("AMOUNT_TOO_SMALL") || msg.includes("INVALID_AMOUNT")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "AMOUNT_TOO_SMALL" });
        }
        if (msg.includes("AMOUNT_TOO_LARGE") || msg.includes("VALUE OUT OF RANGE")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "AMOUNT_TOO_LARGE" });
        }
        if (msg.includes("BET_TOO_LARGE")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "BET_TOO_LARGE" });
        }
        if (msg.includes("INVALID_LIQUIDITY")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_LIQUIDITY" });
        }
        if (msg.includes("ASSET_DISABLED")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "ASSET_DISABLED" });
        }
        if (msg.includes("AMM_STATE_MISSING")) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AMM_STATE_MISSING" });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const result = (Array.isArray(data) ? data[0] : data) as PlaceBetResult | null;

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to place bet",
        });
      }

      return {
        tradeId: String(result.trade_id),
        newBalanceMinor: Number(result.new_balance_minor),
        sharesBought: Number(result.shares_bought),
        priceBefore: Number(result.price_before),
        priceAfter: Number(result.price_after),
      };
    }),

  /**
   * Sell position (cash out shares) - calls RPC that uses auth.uid()
   */
  sellPosition: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        side: z.enum(["YES", "NO"]),
        shares: z.number().positive(),
      })
    )
    .output(
      z.object({
        tradeId: z.string(),
        payoutMinor: z.number(),
        newBalanceMinor: z.number(),
        sharesSold: z.number(),
        priceBefore: z.number(),
        priceAfter: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, authUser } = ctx;
      const { marketId, side, shares } = input;

      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const { data, error } = await (supabase as SupabaseDbClient).rpc("sell_position_tx", {
        p_market_id: marketId,
        p_side: side,
        p_shares: shares,
      });

      if (error) {
        const msg = error.message || "";
        if (msg.includes("NO_POSITION")) throw new TRPCError({ code: "BAD_REQUEST", message: "NO_POSITION" });
        if (msg.includes("INSUFFICIENT_SHARES")) throw new TRPCError({ code: "BAD_REQUEST", message: "INSUFFICIENT_SHARES" });
        if (msg.includes("INVALID_SHARES")) throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_SHARES" });
        if (msg.includes("SHARES_TOO_LARGE")) throw new TRPCError({ code: "BAD_REQUEST", message: "SHARES_TOO_LARGE" });
        if (msg.includes("MARKET_CLOSED") || msg.includes("MARKET_NOT_OPEN")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_CLOSED" });
        }
        if (msg.includes("AMOUNT_TOO_SMALL") || msg.includes("PAYOUT_TOO_SMALL")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "AMOUNT_TOO_SMALL" });
        }
        if (msg.includes("AMM_STATE_MISSING") || msg.includes("AMM_INCONSISTENT") || msg.includes("INVALID_LIQUIDITY")) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AMM_STATE_INVALID" });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const result = (Array.isArray(data) ? data[0] : data) as SellPositionResult | null;

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to sell position",
        });
      }

      const normalizeNumber = (value: string | number | bigint | null | undefined): number | null => {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string" && value.length > 0) {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : null;
        }
        if (typeof value === "bigint") {
          return Number(value);
        }
        return null;
      };

      type SellPositionResultLoose = SellPositionResult & {
        payout_net_minor?: string | number | bigint | null;
        received_minor?: string | number | bigint | null;
        shares_sold?: string | number | bigint | null;
      };
      const loose = result as SellPositionResultLoose;

      const payoutRaw =
        normalizeNumber(loose.payout_net_minor) ??
        normalizeNumber(loose.received_minor);
      const balanceRaw = normalizeNumber(result.new_balance_minor);
      const sharesRaw =
        normalizeNumber(loose.shares_sold) ?? normalizeNumber(shares) ?? 0;
      const priceBeforeRaw = normalizeNumber(result.price_before);
      const priceAfterRaw = normalizeNumber(result.price_after);

      if (payoutRaw === null || balanceRaw === null || priceBeforeRaw === null || priceAfterRaw === null) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "SELL_OUTPUT_INVALID",
        });
      }

      return {
        tradeId: String(result.trade_id),
        payoutMinor: payoutRaw,
        newBalanceMinor: balanceRaw,
        sharesSold: Number.isFinite(sharesRaw) ? sharesRaw : shares,
        priceBefore: priceBeforeRaw,
        priceAfter: priceAfterRaw,
      };
    }),

  /**
   * Resolve market (creator only) - calls service RPC
   */
  resolveMarket: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        outcome: z.enum(["YES", "NO"]),
      })
    )
    .output(
      z.object({
        marketId: z.string(),
        outcome: z.enum(["YES", "NO"]),
        totalPayoutMinor: z.number(),
        winnersCount: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }
      const { marketId, outcome } = input;

      // Enforce creator-only resolution at the API layer (we call the RPC using service_role).
      const { data: marketRow, error: marketLoadError } = await supabaseService
        .from("markets")
        .select("id, created_by, expires_at, resolve_outcome, state")
        .eq("id", marketId)
        .single();

      if (marketLoadError || !marketRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: marketLoadError?.message ?? "Market not found",
        });
      }

      const creatorId = (marketRow as Pick<MarketRow, "created_by">).created_by;
      if (!creatorId || creatorId !== authUser.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Creator only" });
      }

      const endMs = Date.parse(String((marketRow as Pick<MarketRow, "expires_at">).expires_at));
      if (Number.isFinite(endMs) && Date.now() < endMs) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Event has not ended yet" });
      }

      if ((marketRow as Pick<MarketRow, "resolve_outcome" | "state">).resolve_outcome || (marketRow as Pick<MarketRow, "state">).state === "resolved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Market already resolved" });
      }

      // Call the settlement RPC with service_role.
      const { data, error } = await (supabaseService as SupabaseDbClient).rpc("resolve_market_service_tx", {
        p_market_id: marketId,
        p_outcome: outcome,
      });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const result = (Array.isArray(data) ? data[0] : data) as ResolveMarketResult | null;

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to resolve market",
        });
      }

      return {
        marketId: String(result.market_id),
        outcome: result.outcome as "YES" | "NO",
        totalPayoutMinor: Number(result.total_payout_minor),
        winnersCount: Number(result.winners_count),
      };
    }),

  /**
   * Get user's positions (open holdings)
   */
  myPositions: publicProcedure
    .output(z.array(positionSummary))
    .query(async ({ ctx }) => {
      const { supabaseService, authUser, cookies } = ctx;
      if (!authUser) {
        // Log for debugging: check if cookie is present but JWT verification failed
        const hasAuthToken = Boolean(cookies?.auth_token);
        console.warn("[myPositions] authUser is null", { hasAuthToken, cookiesKeys: cookies ? Object.keys(cookies) : [] });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      // Use service client for reads to avoid depending on presence/validity of sb_access_token cookie.
      const { data, error } = await supabaseService
        .from("positions")
        .select(`
          user_id, market_id, outcome, shares, avg_entry_price, updated_at,
          markets:market_id (title_rus, title_eng, state, resolve_outcome, closes_at, expires_at)
        `)
        .eq("user_id", authUser.id)
        .gt("shares", 0)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("[myPositions] Supabase query error", { error: error.message, userId: authUser.id });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows = (data ?? []) as PositionWithMarket[];
      return rows.map((r) => mapPositionRow(r, VCOIN_DECIMALS));
    }),

  /**
   * Get user's trade history
   */
  myTrades: publicProcedure
    .output(z.array(tradeSummary))
    .query(async ({ ctx }) => {
      const { supabaseService, authUser, cookies } = ctx;
      if (!authUser) {
        // Log for debugging: check if cookie is present but JWT verification failed
        const hasAuthToken = Boolean(cookies?.auth_token);
        console.warn("[myTrades] authUser is null", { hasAuthToken, cookiesKeys: cookies ? Object.keys(cookies) : [] });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      // Use service client for reads to avoid depending on presence/validity of sb_access_token cookie.
      const { data, error } = await supabaseService
        .from("trades")
        .select(`
          id, market_id, user_id, action, outcome, asset_code,
          collateral_gross_minor, fee_minor, collateral_net_minor,
          shares_delta, price_before, price_after, created_at,
          markets:market_id (title_rus, title_eng, state, resolve_outcome)
        `)
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error("[myTrades] Supabase query error", { error: error.message, userId: authUser.id });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows: TradeWithMarket[] = data ?? [];
      return rows.map((r) => mapTradeRow(r, VCOIN_DECIMALS));
    }),

  /**
   * Get user's bookmarked markets (IDs)
   */
  myBookmarks: publicProcedure
    .output(z.array(marketBookmarkOutput))
    .query(async ({ ctx }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      // Use service client for reads to avoid depending on presence/validity of sb_access_token cookie.
      const { data, error } = await supabaseService
        .from("market_bookmarks")
        .select("market_id, created_at")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      const rows = (data ?? []) as Pick<MarketBookmarkRow, "market_id" | "created_at">[];
      return rows.map((r) => ({
        marketId: r.market_id,
        createdAt: new Date(r.created_at).toISOString(),
      }));
    }),

  /**
   * Set/unset a bookmark on a market
   */
  setBookmark: publicProcedure
    .input(z.object({ marketId: z.string().uuid(), bookmarked: z.boolean() }))
    .output(z.object({ marketId: z.string(), bookmarked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { supabase, supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const exists = await supabaseService
        .from("markets")
        .select("id")
        .eq("id", input.marketId)
        .maybeSingle();

      if (exists.error || !exists.data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }

      if (input.bookmarked) {
        const ins = await supabase
          .from("market_bookmarks")
          .insert({ user_id: authUser.id, market_id: input.marketId } as Database["public"]["Tables"]["market_bookmarks"]["Insert"]);
        if (ins.error) {
          const msg = String(ins.error.message ?? "");
          if (!msg.toLowerCase().includes("duplicate")) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
          }
        }
      } else {
        const del = await supabase
          .from("market_bookmarks")
          .delete()
          .eq("user_id", authUser.id)
          .eq("market_id", input.marketId);
        if (del.error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: del.error.message });
        }
      }

      return { marketId: input.marketId, bookmarked: input.bookmarked };
    }),

  /**
   * Get wallet balance for current user
   */
  myWalletBalance: publicProcedure
    .output(
      z.object({
        balanceMinor: z.number(),
        balanceMajor: z.number(),
        assetCode: z.string(),
        decimals: z.number(),
      })
    )
    .query(async ({ ctx }) => {
      const { supabase, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const { data, error } = await supabase
        .from("wallet_balances")
        .select("user_id, asset_code, balance_minor")
        .eq("user_id", authUser.id)
        .eq("asset_code", DEFAULT_ASSET)
        .maybeSingle();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const walletRow = data as WalletBalanceRow | null;
      const balanceMinor = walletRow ? Number(walletRow.balance_minor ?? 0) : 0;

      return {
        balanceMinor,
        balanceMajor: toMajorUnits(Number(balanceMinor), VCOIN_DECIMALS),
        assetCode: DEFAULT_ASSET,
        decimals: VCOIN_DECIMALS,
      };
    }),

  /**
   * Get price candles for market chart
   */
  getPriceCandles: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        limit: z.number().min(1).max(1000).optional().default(100),
      })
    )
    .output(
      z.array(
        z.object({
          bucket: z.string(),
          open: z.number(),
          high: z.number(),
          low: z.number(),
          close: z.number(),
          volume: z.number(),
          tradesCount: z.number(),
        })
      )
    )
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("market_price_candles")
        .select("market_id, bucket, open, high, low, close, volume_minor, trades_count")
        .eq("market_id", input.marketId)
        .order("bucket", { ascending: true })
        .limit(input.limit);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      type CandleRow = Database["public"]["Tables"]["market_price_candles"]["Row"];
      return (data ?? []).map((c) => {
        const candle = c as CandleRow;
        return {
          bucket: candle.bucket,
          open: Number(candle.open),
          high: Number(candle.high),
          low: Number(candle.low),
          close: Number(candle.close),
          volume: toMajorUnits(Number(candle.volume_minor), VCOIN_DECIMALS),
          tradesCount: candle.trades_count,
        };
      });
    }),

  /**
   * Get public trades feed (no user identities)
   */
  getPublicTrades: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).optional().default(50),
      })
    )
    .output(
      z.array(
        z.object({
          id: z.string(),
          marketId: z.string(),
          action: z.enum(["buy", "sell"]),
          outcome: z.enum(["YES", "NO"]),
          collateralGross: z.number(),
          sharesDelta: z.number(),
          priceBefore: z.number(),
          priceAfter: z.number(),
          createdAt: z.string(),
        })
      )
    )
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;

      let query = supabase
        .from("trades_public")
        .select("id, market_id, action, outcome, collateral_gross_minor, shares_delta, price_before, price_after, created_at")
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (input.marketId) {
        query = query.eq("market_id", input.marketId);
      }

      const { data, error } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      type PublicTradeRow = Database["public"]["Views"]["trades_public"]["Row"];
      return (data ?? []).map((t) => {
        const trade = t as PublicTradeRow;
        return {
          id: trade.id,
          marketId: trade.market_id,
          action: trade.action as "buy" | "sell",
          outcome: trade.outcome as "YES" | "NO",
          collateralGross: toMajorUnits(Number(trade.collateral_gross_minor), VCOIN_DECIMALS),
          sharesDelta: Number(trade.shares_delta),
          priceBefore: Number(trade.price_before),
          priceAfter: Number(trade.price_after),
          createdAt: new Date(trade.created_at).toISOString(),
        };
      });
    }),

  /**
   * Get market comments (public) with author name + avatar.
   */
  getMarketComments: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        limit: z.number().min(1).max(200).optional().default(50),
      })
    )
    .output(z.array(marketCommentOutput))
    .query(async ({ ctx, input }) => {
      const { supabase, supabaseService, authUser } = ctx;
      const { data, error } = await supabase
        .from("market_comments_public")
        .select("id, market_id, user_id, parent_id, body, created_at, author_name, author_username, author_avatar_url, likes_count")
        .eq("market_id", input.marketId)
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows = (data ?? []) as MarketCommentPublicRow[];

      let likedSet = new Set<string>();
      if (authUser && rows.length > 0) {
        const ids = rows.map((r) => r.id);
        // Use service client so this doesn't depend on a Supabase session cookie in WebViews.
        const liked = await supabaseService
          .from("market_comment_likes")
          .select("comment_id")
          .eq("user_id", authUser.id)
          .in("comment_id", ids);

        if (!liked.error && liked.data) {
          const likeRows = liked.data as Pick<MarketCommentLikeRow, "comment_id">[];
          likedSet = new Set(likeRows.map((r) => r.comment_id));
        }
      }

      return rows.map((c) => ({
        id: c.id,
        marketId: c.market_id,
        userId: c.user_id,
        parentId: c.parent_id ?? null,
        body: c.body,
        createdAt: new Date(c.created_at).toISOString(),
        authorName: c.author_name,
        authorUsername: c.author_username,
        authorAvatarUrl: c.author_avatar_url,
        likesCount: Number(c.likes_count ?? 0),
        likedByMe: likedSet.has(c.id),
      }));
    }),

  /**
   * Post a comment under a market (authenticated).
   */
  postMarketComment: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        body: z.string().trim().min(1).max(2000),
        parentId: z.string().uuid().optional().nullable(),
      })
    )
    .output(marketCommentOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (input.parentId) {
        const { data: parent, error: parentErr } = await supabaseService
          .from("market_comments")
          .select("id, market_id")
          .eq("id", input.parentId)
          .maybeSingle();

        if (parentErr || !parent) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid parent comment" });
        }

        const parentMarketId = String((parent as { market_id: string }).market_id);
        if (parentMarketId !== input.marketId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Parent comment is from another market" });
        }
      }

      const payload: MarketCommentInsert = {
        market_id: input.marketId,
        user_id: authUser.id,
        body: input.body.trim(),
        parent_id: input.parentId ?? null,
      };

      // Use service client (we authenticate via JWT cookie, not Supabase session cookie).
      const inserted = await supabaseService
        .from("market_comments")
        .insert(payload)
        .select("id")
        .single();

      if (inserted.error || !inserted.data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: inserted.error?.message ?? "Failed to create comment",
        });
      }

      const { data: row, error } = await supabaseService
        .from("market_comments_public")
        .select("id, market_id, user_id, parent_id, body, created_at, author_name, author_username, author_avatar_url, likes_count")
        .eq("id", inserted.data.id)
        .single();

      if (error || !row) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Failed to load comment",
        });
      }

      const c = row as MarketCommentPublicRow;
      return {
        id: c.id,
        marketId: c.market_id,
        userId: c.user_id,
        parentId: c.parent_id ?? null,
        body: c.body,
        createdAt: new Date(c.created_at).toISOString(),
        authorName: c.author_name,
        authorUsername: c.author_username,
        authorAvatarUrl: c.author_avatar_url,
        likesCount: Number(c.likes_count ?? 0),
        likedByMe: false,
      };
    }),

  toggleMarketCommentLike: publicProcedure
    .input(
      z.object({
        commentId: z.string().uuid(),
      })
    )
    .output(
      z.object({
        commentId: z.string(),
        likesCount: z.number(),
        likedByMe: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const exists = await supabaseService
        .from("market_comments")
        .select("id")
        .eq("id", input.commentId)
        .maybeSingle();

      if (exists.error || !exists.data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }

      const current = await supabaseService
        .from("market_comment_likes")
        .select("comment_id")
        .eq("comment_id", input.commentId)
        .eq("user_id", authUser.id)
        .maybeSingle();

      const alreadyLiked = Boolean(current.data);

      if (alreadyLiked) {
        const del = await supabaseService
          .from("market_comment_likes")
          .delete()
          .eq("comment_id", input.commentId)
          .eq("user_id", authUser.id);
        if (del.error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: del.error.message });
        }
      } else {
        const ins = await supabaseService
          .from("market_comment_likes")
          .insert({ comment_id: input.commentId, user_id: authUser.id } as Database["public"]["Tables"]["market_comment_likes"]["Insert"]);
        if (ins.error) {
          const msg = String(ins.error.message ?? "");
          if (!msg.toLowerCase().includes("duplicate")) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
          }
        }
      }

      const countRes = await supabaseService
        .from("market_comment_likes")
        .select("comment_id", { count: "exact", head: true })
        .eq("comment_id", input.commentId);

      return {
        commentId: input.commentId,
        likesCount: Number(countRes.count ?? 0),
        likedByMe: !alreadyLiked,
      };
    }),

  myComments: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional().default(50) }).optional())
    .output(
      z.array(
        z.object({
          id: z.string(),
          marketId: z.string(),
          parentId: z.string().nullable(),
          body: z.string(),
          createdAt: z.string(),
          marketTitleRu: z.string(),
          marketTitleEn: z.string(),
          likesCount: z.number(),
        })
      )
    )
    .query(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const limit = input?.limit ?? 50;

      const { data, error } = await supabaseService
        .from("market_comments_public")
        .select("id, market_id, parent_id, body, created_at, likes_count")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      const rows = (data ?? []) as MarketCommentPublicRow[];
      const marketIds = Array.from(new Set(rows.map((r) => r.market_id)));

      const titlesById = new Map<string, Pick<MarketRow, "title_rus" | "title_eng">>();
      if (marketIds.length > 0) {
        const marketsRes = await supabaseService
          .from("markets")
          .select("id, title_rus, title_eng")
          .in("id", marketIds);
        if (!marketsRes.error && marketsRes.data) {
          (marketsRes.data as Array<Pick<MarketRow, "id" | "title_rus" | "title_eng">>).forEach((m) => {
            titlesById.set(m.id, { title_rus: m.title_rus, title_eng: m.title_eng });
          });
        }
      }

      return rows.map((r) => {
        const titles = titlesById.get(r.market_id);
        return {
          id: r.id,
          marketId: r.market_id,
          parentId: r.parent_id ?? null,
          body: r.body,
          createdAt: new Date(r.created_at).toISOString(),
          marketTitleRu: titles?.title_rus ?? titles?.title_eng ?? "",
          marketTitleEn: titles?.title_eng ?? "",
          likesCount: Number(r.likes_count ?? 0),
        };
      });
    }),

  /**
   * Create market (authenticated)
   */
  createMarket: publicProcedure
    .input(
      z.object({
        titleEn: z.string().min(3), // Allow any characters including special characters
        description: z.string().optional().nullable(), // Allow any characters including special characters
        closesAt: z.string().optional().nullable(),
        expiresAt: z.string(), // Accepts datetime-local format (YYYY-MM-DDTHH:MM)
        categoryId: z.string().min(1),
        imageUrl: z.string().optional().nullable(), // Optional image URL from Supabase storage
      })
    )
    .output(
      z.object({
        id: z.string(),
        titleRu: z.string().nullable(),
        titleEn: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const expiresAtMs = Date.parse(input.expiresAt);
      const closesAtMs = input.closesAt ? Date.parse(input.closesAt) : expiresAtMs;
      if (!Number.isFinite(closesAtMs) || !Number.isFinite(expiresAtMs)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid dates" });
      }
      if (closesAtMs > expiresAtMs) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Trading close must be <= end time" });
      }
      // Validate dates are not in the past
      const now = Date.now();
      if (expiresAtMs < now) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Event end time must be in the future" });
      }
      if (closesAtMs < now) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Trading close time must be in the future" });
      }

      const { data: category, error: categoryError } = await supabaseService
        .from("market_categories")
        .select("id, label_ru, label_en, is_enabled")
        .eq("id", input.categoryId)
        .maybeSingle();

      const cat = category as Pick<MarketCategoryRow, "id" | "label_ru" | "label_en" | "is_enabled"> | null;
      if (categoryError || !cat || !cat.is_enabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid category" });
      }

      // Validate trimmed title is not empty
      const titleEnTrimmed = input.titleEn.trim();
      if (titleEnTrimmed.length < 3) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Title must be at least 3 characters" });
      }

      // Insert market - title_rus is optional (nullable) for English-only markets
      const { data: market, error: marketError } = await (supabaseService as SupabaseDbClient)
        .from("markets")
        .insert({
          title_rus: null, // Optional field - focusing on English audience
          title_eng: titleEnTrimmed,
          description: input.description?.trim() || null,
          image_url: input.imageUrl?.trim() || null,
          state: "open",
          closes_at: new Date(closesAtMs).toISOString(),
          expires_at: new Date(expiresAtMs).toISOString(),
          created_by: authUser.id,
          settlement_asset_code: DEFAULT_ASSET,
          fee_bps: 0,
          liquidity_b: 100,
          amm_type: "lmsr",
          category_id: cat.id,
        })
        .select("id, title_rus, title_eng")
        .single();

      if (marketError || !market) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: marketError?.message ?? "Failed to create market",
        });
      }

      // Insert AMM state (use upsert with ignoreDuplicates to handle race conditions)
      const { error: ammError } = await (supabaseService as SupabaseDbClient)
        .from("market_amm_state")
        .upsert(
          {
            market_id: market.id,
            b: 100,
            q_yes: 0,
            q_no: 0,
            last_price_yes: 0.5,
            fee_accumulated_minor: 0,
          },
          {
            onConflict: "market_id",
            ignoreDuplicates: true, // Silently skip if already exists (handles race conditions)
          }
        );

      if (ammError) {
        // Rollback by deleting market (not ideal, but simple)
        await supabaseService.from("markets").delete().eq("id", market.id);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: ammError.message,
        });
      }

      return { id: market.id, titleRu: market.title_rus ?? market.title_eng, titleEn: market.title_eng };
    }),
});
