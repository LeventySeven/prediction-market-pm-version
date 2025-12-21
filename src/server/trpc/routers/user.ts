import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toMajorUnits } from "../helpers/pricing";
import type { Database } from "../../../types/database";

const DEFAULT_ASSET = "VCOIN";
const VCOIN_DECIMALS = 6;

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type UserInsert = Database["public"]["Tables"]["users"]["Insert"];
type WalletBalanceInsert = Database["public"]["Tables"]["wallet_balances"]["Insert"];
type WalletBalanceRow = Pick<
  Database["public"]["Tables"]["wallet_balances"]["Row"],
  "balance_minor"
>;
type WalletTransactionRow = Pick<
  Database["public"]["Tables"]["wallet_transactions"]["Row"],
  "id" | "asset_code" | "amount_minor" | "kind" | "market_id" | "trade_id" | "created_at"
>;

const userShape = {
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  displayName: z.string().nullable(),
  balance: z.number(),
  createdAt: z.string(),
  isAdmin: z.boolean(),
};

const selectColumns =
  "id, email, username, display_name, created_at, is_admin";

const USERS_TABLE = "users" as const;
const WALLET_BALANCES_TABLE = "wallet_balances" as const;

const formatUser = (row: UserRow, balanceMinor: number = 0) => ({
  id: String(row.id),
  email: row.email,
  username: row.username,
  displayName: row.display_name,
  balance: toMajorUnits(balanceMinor, VCOIN_DECIMALS),
  createdAt: new Date(row.created_at).toISOString(),
  isAdmin: Boolean(row.is_admin),
});

export const userRouter = router({
  registerUser: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        username: z.string().min(3).max(32),
        displayName: z.string().optional(),
      })
    )
    .output(z.object(userShape))
    .mutation(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const email = input.email.trim().toLowerCase();
      const username = input.username.trim();
      const displayName = input.displayName?.trim() || username;

      const existing = await supabase
        .from("users")
        .select(selectColumns)
        .eq("email", email)
        .maybeSingle();

      if (existing.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: existing.error.message,
        });
      }

      const existingRow = existing.data as UserRow | null;
      if (existingRow) {
        // Fetch wallet balance for existing user
        const { data: walletRow } = await supabase
          .from("wallet_balances")
          .select("balance_minor")
          .eq("user_id", existingRow.id)
          .eq("asset_code", DEFAULT_ASSET)
          .maybeSingle();

        const wallet = walletRow as WalletBalanceRow | null;
        const balanceMinor = wallet ? Number(wallet.balance_minor ?? 0) : 0;
        return formatUser(existingRow, balanceMinor);
      }

      const payload: UserInsert = {
        email,
        username,
        display_name: displayName,
        is_admin: false,
      };

      const insert = await (supabase as unknown as SupabaseClient<any>)
        .from(USERS_TABLE)
        .insert(payload)
        .select(selectColumns)
        .single();

      if (insert.error || !insert.data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: insert.error?.message ?? "Failed to create user",
        });
      }

      // Initialize wallet balance for new user
      await (supabase as unknown as SupabaseClient<any>)
        .from(WALLET_BALANCES_TABLE)
        .insert({
          user_id: insert.data.id,
          asset_code: DEFAULT_ASSET,
          balance_minor: 0,
        } as WalletBalanceInsert)
        .select()
        .maybeSingle();

      return formatUser(insert.data as UserRow, 0);
    }),

  getMe: publicProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
      })
    )
    .output(z.object(userShape))
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;

      const userResult = await (supabase as unknown as SupabaseClient<any>)
        .from(USERS_TABLE)
        .select(selectColumns)
        .eq("id", input.userId)
        .maybeSingle();

      if (userResult.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: userResult.error.message,
        });
      }

      if (!userResult.data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Fetch wallet balance
      const targetUser = userResult.data as UserRow | null;
      if (!targetUser) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "User not found after registration" });
      }
      const { data: walletRow } = await supabase
        .from("wallet_balances")
        .select("balance_minor")
        .eq("user_id", targetUser.id)
        .eq("asset_code", DEFAULT_ASSET)
        .maybeSingle();

      const wallet = walletRow as WalletBalanceRow | null;
      const balanceMinor = wallet ? Number(wallet.balance_minor ?? 0) : 0;
      return formatUser(targetUser, balanceMinor);
    }),

  /**
   * Get wallet transactions for the current user
   */
  myWalletTransactions: publicProcedure
    .output(
      z.array(
        z.object({
          id: z.string(),
          assetCode: z.string(),
          amountMinor: z.number(),
          amountMajor: z.number(),
          kind: z.string(),
          marketId: z.string().nullable(),
          tradeId: z.string().nullable(),
          createdAt: z.string(),
        })
      )
    )
    .query(async ({ ctx }) => {
      const { supabase, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("id, user_id, asset_code, amount_minor, kind, market_id, trade_id, created_at")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows = (data ?? []) as WalletTransactionRow[];
      return rows.map((tx) => ({
        id: tx.id,
        assetCode: tx.asset_code,
        amountMinor: Number(tx.amount_minor),
        amountMajor: toMajorUnits(Number(tx.amount_minor), VCOIN_DECIMALS),
        kind: tx.kind,
        marketId: tx.market_id,
        tradeId: tx.trade_id,
        createdAt: new Date(tx.created_at).toISOString(),
      }));
    }),
});
