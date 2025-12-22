import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { calculateLMSRPrices, toMajorUnits } from "../helpers/pricing";
import type { Database } from "../../../types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type SupabaseAnyClient = SupabaseClient<Database, "public", any>;

// Default asset for the platform
const DEFAULT_ASSET = "VCOIN";
const VCOIN_DECIMALS = 6;

type MarketRow = Database["public"]["Tables"]["markets"]["Row"];
type AmmStateRow = Database["public"]["Tables"]["market_amm_state"]["Row"];
type PositionRow = Database["public"]["Tables"]["positions"]["Row"];
type TradeRow = Database["public"]["Tables"]["trades"]["Row"];
type MarketWithAmm = MarketRow & {
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

const mapMarketRow = (row: MarketWithAmm) => {
  const amm = row.market_amm_state;
  const { priceYes, priceNo } = amm
    ? calculateLMSRPrices(Number(amm.q_yes), Number(amm.q_no), Number(amm.b))
    : { priceYes: 0.5, priceNo: 0.5 };

  return {
    id: row.id,
    titleRu: row.title_rus,
    titleEn: row.title_eng,
    description: row.description,
    state: row.state,
    closesAt: new Date(row.closes_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    outcome: row.resolve_outcome,
    settlementAsset: row.settlement_asset_code,
    feeBps: row.fee_bps,
    liquidityB: Number(row.liquidity_b),
    priceYes,
    priceNo,
    volume: deriveVolumeMajor(amm, row.fee_bps),
  };
};

const mapPositionRow = (row: PositionWithMarket, decimals: number) => {
  return {
    marketId: row.market_id,
    outcome: row.outcome,
    shares: Number(row.shares),
    avgEntryPrice: row.avg_entry_price ? Number(row.avg_entry_price) : null,
    marketTitleRu: row.markets?.title_rus ?? "",
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
    marketTitleRu: row.markets?.title_rus ?? "",
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

const marketOutput = z.object({
  id: z.string(),
  titleRu: z.string(),
  titleEn: z.string(),
  description: z.string().nullable(),
  state: z.string(),
  closesAt: z.string(),
  expiresAt: z.string(),
  outcome: z.enum(["YES", "NO"]).nullable(),
  settlementAsset: z.string(),
  feeBps: z.number(),
  liquidityB: z.number(),
  priceYes: z.number(),
  priceNo: z.number(),
  volume: z.number(),
});

export const marketRouter = router({
  listMarkets: publicProcedure
    .input(z.object({ onlyOpen: z.boolean().optional() }).optional())
    .output(z.array(marketOutput))
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const onlyOpen = input?.onlyOpen ?? false;

      let query = supabase
        .from("markets")
        .select(`
          id, title_rus, title_eng, description, state, closes_at, expires_at,
          resolve_outcome, settlement_asset_code, fee_bps, liquidity_b, amm_type, created_at,
          market_amm_state (market_id, b, q_yes, q_no, last_price_yes, fee_accumulated_minor)
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

      const rows = (data ?? []) as MarketWithAmm[];
      return rows.map(mapMarketRow);
    }),

  getMarket: publicProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .output(marketOutput)
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;

      const { data, error } = await supabase
        .from("markets")
        .select(`
          id, title_rus, title_eng, description, state, closes_at, expires_at,
          resolve_outcome, settlement_asset_code, fee_bps, liquidity_b, amm_type, created_at,
          market_amm_state (market_id, b, q_yes, q_no, last_price_yes, fee_accumulated_minor)
        `)
        .eq("id", input.marketId)
        .single();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }

      return mapMarketRow(data as MarketWithAmm);
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
      const { supabase, authUser } = ctx;
      const { marketId, side, amount } = input;

      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      // Call the RPC - it uses auth.uid() internally, no user_id passed
      const { data, error } = await (supabase as SupabaseAnyClient).rpc("place_bet_tx", {
        p_market_id: marketId,
        p_side: side,
        p_amount: amount,
      });

      if (error) {
        // Map common DB errors to user-friendly messages
        const msg = (error.message || "").toUpperCase();
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

      const { data, error } = await (supabase as SupabaseAnyClient).rpc("sell_position_tx", {
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

      const normalizeNumber = (value: unknown): number | null => {
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

      const payoutRaw =
        normalizeNumber((result as { payout_net_minor?: unknown }).payout_net_minor) ??
        normalizeNumber((result as { received_minor?: unknown }).received_minor);
      const balanceRaw = normalizeNumber(result.new_balance_minor);
      const sharesRaw =
        normalizeNumber((result as { shares_sold?: unknown }).shares_sold) ?? normalizeNumber(shares) ?? 0;
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
   * Resolve market (admin only) - calls service RPC
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
      if (!authUser || !authUser.isAdmin) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin only" });
      }
      const { marketId, outcome } = input;

      // This RPC should be called with service_role for production
      // For now we call it as admin user - the DB function should check admin status
      const { data, error } = await (supabaseService as SupabaseAnyClient).rpc("resolve_market_service_tx", {
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
      const { supabase, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const { data, error } = await supabase
        .from("positions")
        .select(`
          user_id, market_id, outcome, shares, avg_entry_price, updated_at,
          markets:market_id (title_rus, title_eng, state, resolve_outcome, closes_at, expires_at)
        `)
        .eq("user_id", authUser.id)
        .gt("shares", 0)
        .order("updated_at", { ascending: false });

      if (error) {
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
      const { supabase, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const { data, error } = await supabase
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
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows = (data ?? []) as TradeWithMarket[];
      return rows.map((r) => mapTradeRow(r, VCOIN_DECIMALS));
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
   * Create market (admin only)
   */
  createMarket: publicProcedure
    .input(
      z.object({
        titleRu: z.string().min(3),
        titleEn: z.string().min(3),
        description: z.string().optional().nullable(),
        closesAt: z.string(),
        expiresAt: z.string(),
        liquidityB: z.number().positive().optional().default(100),
        feeBps: z.number().min(0).max(2000).optional().default(200),
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
      if (!authUser || !authUser.isAdmin) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin only" });
      }

      const closesAtMs = Date.parse(input.closesAt);
      const expiresAtMs = Date.parse(input.expiresAt);
      if (!Number.isFinite(closesAtMs) || !Number.isFinite(expiresAtMs)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid dates" });
      }

      // Insert market
      const { data: market, error: marketError } = await (supabaseService as SupabaseAnyClient)
        .from("markets")
        .insert({
          title_rus: input.titleRu.trim(),
          title_eng: input.titleEn.trim(),
          description: input.description ?? null,
          state: "open",
          closes_at: new Date(closesAtMs).toISOString(),
          expires_at: new Date(expiresAtMs).toISOString(),
          settlement_asset_code: DEFAULT_ASSET,
          fee_bps: input.feeBps,
          liquidity_b: input.liquidityB,
          amm_type: "lmsr",
        })
        .select("id, title_rus, title_eng")
        .single();

      if (marketError || !market) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: marketError?.message ?? "Failed to create market",
        });
      }

      // Insert AMM state
      const { error: ammError } = await (supabaseService as SupabaseAnyClient)
        .from("market_amm_state")
        .insert({
          market_id: market.id,
          b: input.liquidityB,
          q_yes: 0,
          q_no: 0,
          last_price_yes: 0.5,
          fee_accumulated_minor: 0,
        });

      if (ammError) {
        // Rollback by deleting market (not ideal, but simple)
        await supabaseService.from("markets").delete().eq("id", market.id);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: ammError.message,
        });
      }

      return { id: market.id, titleRu: market.title_rus, titleEn: market.title_eng };
    }),
});
