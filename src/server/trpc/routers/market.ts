import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { calculatePayout, calculatePrices } from "../helpers/pricing";

const betSummary = z.object({
  id: z.number(),
  marketId: z.number(),
  side: z.enum(["YES", "NO"]),
  amount: z.number(),
  status: z.string(),
  payout: z.number().nullable(),
  createdAt: z.string(),
  marketTitle: z.string(),
  marketOutcome: z.enum(["YES", "NO"]).nullable(),
});

const marketOutput = z.object({
  id: z.number(),
  title: z.string(),
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
          "id, title, description, pool_yes, pool_no, expires_at, outcome"
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

      return (
        data?.map((m) => {
          const { priceYes, priceNo } = calculatePrices(
            Number(m.pool_yes),
            Number(m.pool_no)
          );
          return {
            id: Number(m.id),
            title: m.title,
            description: m.description,
            poolYes: Number(m.pool_yes),
            poolNo: Number(m.pool_no),
            expiresAt: new Date(m.expires_at).toISOString(),
            outcome: m.outcome as "YES" | "NO" | null,
            priceYes,
            priceNo,
          };
        }) ?? []
      );
    }),

  placeBet: publicProcedure
    .input(
      z.object({
        marketId: z.number(),
        side: z.enum(["YES", "NO"]),
        amount: z.number().positive(),
      })
    )
    .output(
      z.object({
        betId: z.number(),
        userId: z.number(),
        newBalance: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, authUser } = ctx;
      const { marketId, side, amount } = input;

      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
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

      const marketRes = await supabase
        .from("markets")
        .select("id, outcome, expires_at")
        .eq("id", marketId)
        .maybeSingle();

      if (!marketRes.data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }

      if (marketRes.data.outcome) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Market already resolved",
        });
      }

      const expiresAt = new Date(marketRes.data.expires_at).getTime();
      if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Market expired",
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
      });

      if (rpc.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: rpc.error.message,
        });
      }

      const raw = rpc.data as
        | { bet_id: number; new_balance: number }
        | Array<{ bet_id: number; new_balance: number }>
        | null;

      const result = Array.isArray(raw) ? raw[0] : raw;
      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to place bet",
        });
      }

      return {
        betId: Number(result.bet_id),
        userId: authUser.id,
        newBalance: Number(result.new_balance),
      };
    }),

  resolveMarket: publicProcedure
    .input(
      z.object({
        marketId: z.number(),
        outcome: z.enum(["YES", "NO"]),
      })
    )
    .output(
      z.object({
        marketId: z.number(),
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
      });

      if (rpc.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: rpc.error.message,
        });
      }

      const result = rpc.data as {
        market_id: number;
        outcome: "YES" | "NO";
        total_pool: number;
        winner_pool: number;
        updated_bets_count: number;
      } | null;

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to resolve market",
        });
      }

      return {
        marketId: Number(result.market_id),
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
              title,
              outcome
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

      return (
        data?.map((row: any) => ({
          id: Number(row.id),
          marketId: Number(row.market_id),
          side: row.side as "YES" | "NO",
          amount: Number(row.amount),
          status: row.status,
          payout: row.payout !== null ? Number(row.payout) : null,
          createdAt: new Date(row.created_at).toISOString(),
          marketTitle: row.markets?.title ?? "—",
          marketOutcome: row.markets?.outcome ?? null,
        })) ?? []
      );
    }),
});

