import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { toMajorUnits } from "../helpers/pricing";
import type { Database } from "../../../types/database";
import { randomBytes } from "node:crypto";
import { leaderboardUsersSchema } from "../../../schemas/leaderboard";
import { buildInitialsAvatarDataUrl } from "@/lib/avatar";

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

type LeaderboardRow = Database["public"]["Views"]["leaderboard_public"]["Row"];

const userShape = {
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  telegramPhotoUrl: z.string().nullable(),
  referralCode: z.string().nullable(),
  referralCommissionRate: z.number().nullable(),
  referralEnabled: z.boolean().nullable(),
  balance: z.number(),
  createdAt: z.string(),
  isAdmin: z.boolean(),
};

const selectColumns =
  "id, email, username, display_name, avatar_url, telegram_photo_url, referral_code, referral_commission_rate, referral_enabled, created_at, is_admin";

const USERS_TABLE = "users" as const;
const WALLET_BALANCES_TABLE = "wallet_balances" as const;

const formatUser = (row: UserRow, balanceMinor: number = 0) => ({
  id: String(row.id),
  email: row.email,
  username: row.username,
  displayName: row.display_name,
  avatarUrl: row.avatar_url ?? null,
  telegramPhotoUrl: row.telegram_photo_url ?? null,
  referralCode: row.referral_code,
  referralCommissionRate:
    row.referral_commission_rate === null || row.referral_commission_rate === undefined
      ? null
      : Number(row.referral_commission_rate),
  referralEnabled: row.referral_enabled,
  balance: toMajorUnits(balanceMinor, VCOIN_DECIMALS),
  createdAt: new Date(row.created_at).toISOString(),
  isAdmin: Boolean(row.is_admin),
});

const normalizeDisplayName = (value: string) => value.trim().replace(/\s+/g, " ");

const buildReferralCode = () => {
  // Short, URL-safe, uppercase-ish code
  const bytes = randomBytes(6); // 12 hex chars
  return bytes.toString("hex").toUpperCase();
};

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

      const insert = await supabase
        .from("users")
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
      await supabase
        .from("wallet_balances")
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

      const userResult = await supabase
        .from("users")
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

  /**
   * Update display name for the current user (mutable nickname).
   */
  updateDisplayName: publicProcedure
    .input(
      z.object({
        displayName: z.string().min(2).max(32),
      })
    )
    .output(z.object(userShape))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const nextName = normalizeDisplayName(input.displayName);
      if (nextName.length < 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Display name is too short" });
      }

      const updated = await supabaseService
        .from("users")
        .update({ display_name: nextName })
        .eq("id", authUser.id)
        .select(selectColumns)
        .single();

      if (updated.error || !updated.data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: updated.error?.message ?? "Failed to update display name",
        });
      }

      const { data: walletRow } = await supabaseService
        .from("wallet_balances")
        .select("balance_minor")
        .eq("user_id", authUser.id)
        .eq("asset_code", DEFAULT_ASSET)
        .maybeSingle();

      const wallet = walletRow as WalletBalanceRow | null;
      const balanceMinor = wallet ? Number(wallet.balance_minor ?? 0) : 0;
      return formatUser(updated.data as UserRow, balanceMinor);
    }),

  /**
   * Update avatar URL for the current user (custom avatar).
   * Pass null/empty to clear and fall back to Telegram avatar (if any).
   */
  updateAvatarUrl: publicProcedure
    .input(
      z.object({
        avatarUrl: z.string().max(2048).nullable(),
      })
    )
    .output(z.object(userShape))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      let next: string | null = input.avatarUrl ? input.avatarUrl.trim() : null;
      if (next === "") next = null;

      if (next) {
        let parsed: URL;
        try {
          parsed = new URL(next);
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid avatar URL" });
        }
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Avatar URL must be http(s)" });
        }
      }

      const updated = await supabaseService
        .from("users")
        .update({ avatar_url: next })
        .eq("id", authUser.id)
        .select(selectColumns)
        .single();

      if (updated.error || !updated.data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: updated.error?.message ?? "Failed to update avatar",
        });
      }

      const { data: walletRow } = await supabaseService
        .from("wallet_balances")
        .select("balance_minor")
        .eq("user_id", authUser.id)
        .eq("asset_code", DEFAULT_ASSET)
        .maybeSingle();

      const wallet = walletRow as WalletBalanceRow | null;
      const balanceMinor = wallet ? Number(wallet.balance_minor ?? 0) : 0;
      return formatUser(updated.data as UserRow, balanceMinor);
    }),

  /**
   * Create a referral link/code for the current user.
   * Default commission is 50% (0.5) unless already set (e.g. 70% issued manually in Supabase).
   */
  createReferralLink: publicProcedure
    .output(
      z.object({
        referralCode: z.string(),
        referralCommissionRate: z.number(),
        referralEnabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const existing = await supabaseService
        .from("users")
        .select("id, referral_code, referral_commission_rate, referral_enabled")
        .eq("id", authUser.id)
        .single();

      if (existing.error || !existing.data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: existing.error?.message ?? "Failed to load user",
        });
      }

      const row = existing.data as Pick<
        UserRow,
        "id" | "referral_code" | "referral_commission_rate" | "referral_enabled"
      >;

      const desiredRate = row.referral_commission_rate ?? 0.5;
      const desiredEnabled = true;

      // If a code already exists, ensure the link is enabled and has a rate set (don't override 70% etc).
      if (row.referral_code) {
        if (row.referral_enabled === true && row.referral_commission_rate !== null) {
          return {
            referralCode: row.referral_code,
            referralCommissionRate: Number(row.referral_commission_rate),
            referralEnabled: true,
          };
        }

        const updatedExisting = await supabaseService
          .from("users")
          .update({
            referral_commission_rate: desiredRate,
            referral_enabled: desiredEnabled,
          })
          .eq("id", authUser.id)
          .select("referral_code, referral_commission_rate, referral_enabled")
          .single();

        if (updatedExisting.error || !updatedExisting.data) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: updatedExisting.error?.message ?? "Failed to enable referral link",
          });
        }

        return {
          referralCode: String(updatedExisting.data.referral_code),
          referralCommissionRate: Number(updatedExisting.data.referral_commission_rate ?? desiredRate),
          referralEnabled: updatedExisting.data.referral_enabled === true,
        };
      }

      // Generate a unique code (best-effort).
      let code: string | null = null;
      for (let i = 0; i < 8; i++) {
        const candidate = buildReferralCode();
        const { data: conflict } = await supabaseService
          .from("users")
          .select("id")
          .eq("referral_code", candidate)
          .maybeSingle();
        if (!conflict) {
          code = candidate;
          break;
        }
      }

      if (!code) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate referral code",
        });
      }

      const updated = await supabaseService
        .from("users")
        .update({
          referral_code: code,
          referral_commission_rate: desiredRate,
          referral_enabled: true,
        })
        .eq("id", authUser.id)
        .select("referral_code, referral_commission_rate, referral_enabled")
        .single();

      if (updated.error || !updated.data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: updated.error?.message ?? "Failed to create referral link",
        });
      }

      return {
        referralCode: String(updated.data.referral_code),
        referralCommissionRate: Number(updated.data.referral_commission_rate ?? desiredRate),
        referralEnabled: updated.data.referral_enabled === true,
      };
    }),

  /**
   * Public leaderboard (no mock data).
   */
  leaderboard: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).optional(),
        })
        .optional()
    )
    .output(leaderboardUsersSchema)
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const limit = input?.limit ?? 25;

      const { data, error } = await supabase
        .from("leaderboard_public")
        .select("user_id, name, username, avatar_url, balance_minor, pnl_minor, bet_count, referrals, rank")
        .order("rank", { ascending: true })
        .limit(limit);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows = (data ?? []) as LeaderboardRow[];
      return rows.map((r) => {
        const name = (r.name || r.username || "").trim() || "Trader";
        const avatar = r.avatar_url || buildInitialsAvatarDataUrl(name, { bg: "#111111", fg: "#ffffff" });
        return {
          id: r.user_id,
          rank: Number(r.rank),
          name,
          username: r.username,
          avatar,
          balance: toMajorUnits(Number(r.balance_minor ?? 0), VCOIN_DECIMALS),
          pnl: toMajorUnits(Number(r.pnl_minor ?? 0), VCOIN_DECIMALS),
          referrals: Number(r.referrals ?? 0),
          betCount: Number(r.bet_count ?? 0),
        };
      });
    }),
});
