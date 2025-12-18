import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { calculatePayout, calculatePrices } from "../helpers/pricing";
import type { Database } from "../../../types/database";

type MarketRow = Database["public"]["Tables"]["markets"]["Row"];
type BetRow = Database["public"]["Tables"]["bets"]["Row"];
type BetWithMarket = BetRow & {
  markets: Pick<
    MarketRow,
    "title_rus" | "title_eng" | "outcome" | "pool_yes" | "pool_no" | "expires_at"
  > | null;
};
type PlaceBetTxArgs = Database["public"]["Functions"]["place_bet_tx"]["Args"];
type PlaceBetTxResult = Database["public"]["Functions"]["place_bet_tx"]["Returns"];
type ResolveMarketArgs =
  Database["public"]["Functions"]["resolve_market_tx"]["Args"];
type ResolveMarketResult =
  Database["public"]["Functions"]["resolve_market_tx"]["Returns"];

const mapMarketRow = (row: MarketRow) => {
  const { priceYes, priceNo } = calculatePrices(
    Number(row.pool_yes),
    Number(row.pool_no)
  );

  return {
    id: row.id,
    titleRu: row.title_rus,
    titleEn: row.title_eng,
    description: row.description,
    poolYes: Number(row.pool_yes),
    poolNo: Number(row.pool_no),
    expiresAt: new Date(row.expires_at).toISOString(),
    outcome: row.outcome,
    priceYes,
    priceNo,
  };
};

const mapBetRow = (row: BetWithMarket) => {
  const poolYes = Number(row.markets?.pool_yes ?? 0);
  const poolNo = Number(row.markets?.pool_no ?? 0);
  const total = poolYes + poolNo || 1;
  const priceYes = poolYes / total;
  const priceNo = poolNo / total;

  return {
    id: row.id,
    marketId: row.market_id,
    side: row.side,
    amount: Number(row.amount),
    status: row.status,
    payout: row.payout,
    createdAt: new Date(row.created_at).toISOString(),
    marketTitleRu: row.markets?.title_rus ?? "",
    marketTitleEn: row.markets?.title_eng ?? "",
    marketOutcome: row.markets?.outcome ?? null,
    expiresAt: row.markets?.expires_at
      ? new Date(row.markets.expires_at).toISOString()
      : null,
    priceYes,
    priceNo,
  };
};

const betSummary = z.object({
  id: z.string(),
  marketId: z.string(),
  side: z.enum(["YES", "NO"]),
  amount: z.number(),
  status: z.string(),
  payout: z.number().nullable(),
  createdAt: z.string(),
  marketTitleRu: z.string(),
  marketTitleEn: z.string(),
  marketOutcome: z.enum(["YES", "NO"]).nullable(),
  expiresAt: z.string().nullable(),
  priceYes: z.number().nullable(),
  priceNo: z.number().nullable(),
});

const marketOutput = z.object({
  id: z.string(),
  titleRu: z.string(),
  titleEn: z.string(),
  description: z.string().nullable(),
  poolYes: z.number(),
  poolNo: z.number(),
  expiresAt: z.string(),
  outcome: z.enum(["YES", "NO"]).nullable(),
  priceYes: z.number(),
  priceNo: z.number(),
});

export const marketRouter = router({
  listMarkets: publicProcedure
    .input(z.object({ onlyOpen: z.boolean().optional() }).optional())
    .output(z.array(marketOutput))
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const onlyOpen = input?.onlyOpen ?? false;

      const query = supabase
        .from("markets")
        .select(
          "id, title_rus, title_eng, description, pool_yes, pool_no, expires_at, outcome"
        )
        .order("id", { ascending: true });

      if (onlyOpen) {
        query.is("outcome", null);
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows = (data ?? []) as MarketRow[];
      return rows.map(mapMarketRow);
    }),

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
        betId: z.string(),
        userId: z.string(),
        newBalance: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, authUser } = ctx;
      const { marketId, side, amount } = input;

      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const marketRes = await supabase
        .from("markets")
        .select("id, outcome, expires_at")
        .eq("id", marketId)
        .maybeSingle();

      const market = marketRes.data as MarketRow | null;

      if (!market) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }

      if (market.outcome) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Market already resolved",
        });
      }

      const expiresAt = Date.parse(market.expires_at);
      const graceMs = 5 * 60 * 1000;
      if (Number.isFinite(expiresAt) && expiresAt + graceMs < Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "MARKET_EXPIRED",
        });
      }

      const userRes = await supabase
        .from("users")
        .select("id, balance")
        .eq("id", authUser.id)
        .maybeSingle();

      if (!userRes.data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const balance = Number(userRes.data.balance);
      if (balance < amount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "INSUFFICIENT_BALANCE",
        });
      }

      /**
       * Transaction note:
       * For true atomicity use a Postgres function (example in db/functions/place_bet_tx.sql)
       * and call via supabase.rpc. PostgREST does not support multi-step transactions.
       */
      const rpc = await supabase.rpc("place_bet_tx", {
        p_user_id: authUser.id,
        p_market_id: marketId,
        p_side: side,
        p_amount: amount,
      } satisfies PlaceBetTxArgs);

      if (rpc.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: rpc.error.message,
        });
      }

      const raw = rpc.data as PlaceBetTxResult | PlaceBetTxResult[] | null;

      const result = Array.isArray(raw) ? raw[0] : raw;

      let betId = result?.bet_id ? String(result.bet_id) : null;
      let newBalance = result?.new_balance ? Number(result.new_balance) : null;

      // Fallback: if RPC returned no row, fetch balance manually to avoid throwing after a successful tx.
      if (!newBalance) {
        const fallback = await supabase
          .from("users")
          .select("balance")
          .eq("id", authUser.id)
          .maybeSingle();
        if (fallback.data) {
          newBalance = Number(fallback.data.balance);
        }
      }

      if (!betId) {
        // We may not have the bet id; return 'unknown' as placeholder rather than failing the call.
        betId = "unknown";
      }

      return {
        betId,
        userId: authUser.id,
        newBalance: newBalance ?? 0,
      };
    }),

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
        totalPool: z.number(),
        winnerPool: z.number(),
        updatedBetsCount: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const { marketId, outcome } = input;

      /**
       * Transaction note:
       * This expects a Postgres function resolve_market_tx defined in db/functions/resolve_market_tx.sql.
       * It performs all updates atomically.
       */
      const rpc = await supabase.rpc("resolve_market_tx", {
        p_market_id: marketId,
        p_outcome: outcome,
      } satisfies ResolveMarketArgs);

      if (rpc.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: rpc.error.message,
        });
      }

      const result = rpc.data as ResolveMarketResult | null;

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to resolve market",
        });
      }

      return {
        marketId: String(result.market_id),
        outcome: result.outcome,
        totalPool: Number(result.total_pool),
        winnerPool: Number(result.winner_pool),
        updatedBetsCount: Number(result.updated_bets_count),
      };
    }),

  myBets: publicProcedure
    .output(z.array(betSummary))
    .query(async ({ ctx }) => {
      const { supabase, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const { data, error } = await supabase
        .from("bets")
        .select(
          `
            id,
            market_id,
            side,
            amount,
            status,
            payout,
            created_at,
            markets:market_id (
              title_rus,
              title_eng,
              outcome,
              pool_yes,
              pool_no,
              expires_at
            )
          `
        )
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows = (data ?? []) as BetWithMarket[];
      return rows.map(mapBetRow);
    }),

  createMarket: publicProcedure
    .input(
      z.object({
        titleRu: z.string().min(3),
        titleEn: z.string().min(3),
        description: z.string().optional().nullable(),
        expiresAt: z.string(),
        poolYes: z.number().optional().default(0),
        poolNo: z.number().optional().default(0),
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
      const { supabase, authUser } = ctx;
      if (!authUser || !authUser.isAdmin) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin only" });
      }

      const expiresAtMs = Date.parse(input.expiresAt);
      if (!Number.isFinite(expiresAtMs)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid expiresAt" });
      }

      const { data, error } = await supabase
        .from("markets")
        .insert({
          title_rus: input.titleRu.trim(),
          title_eng: input.titleEn.trim(),
          description: input.description ?? null,
          pool_yes: input.poolYes ?? 0,
          pool_no: input.poolNo ?? 0,
          expires_at: new Date(expiresAtMs).toISOString(),
          outcome: null,
        })
        .select("id, title_rus, title_eng")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Failed to create market",
        });
      }

      return { id: data.id, titleRu: data.title_rus, titleEn: data.title_eng };
    }),
});

