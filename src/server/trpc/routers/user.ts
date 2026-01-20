import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { toMajorUnits } from "../helpers/pricing";
import type { Database } from "../../../types/database";
import { randomBytes } from "node:crypto";
import { leaderboardUsersSchema } from "../../../schemas/leaderboard";
import { buildInitialsAvatarDataUrl } from "@/lib/avatar";
import { PublicKey } from "@solana/web3.js";

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
type UsersPublicRow = Database["public"]["Views"]["users_public"]["Row"];
type UserPnlDailyRow = Database["public"]["Views"]["user_pnl_daily_public"]["Row"];
type UserMarketVoteRow = Database["public"]["Views"]["user_market_votes_public"]["Row"];
type UserMarketBetRow = Database["public"]["Views"]["user_market_bets_public"]["Row"];
type MarketCommentPublicRow = Database["public"]["Views"]["market_comments_public"]["Row"];
type WalletTxPublicRow = Database["public"]["Views"]["wallet_transactions_public"]["Row"];

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
  // Solana wallet fields
  solanaWalletAddress: z.string().nullable(),
  solanaCluster: z.string().nullable(),
  solanaWalletConnectedAt: z.string().nullable(),
};

const selectColumns =
  "id, email, username, display_name, avatar_url, telegram_photo_url, referral_code, referral_commission_rate, referral_enabled, created_at, is_admin, solana_wallet_address, solana_cluster, solana_wallet_connected_at";

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
  // Solana wallet fields
  solanaWalletAddress: row.solana_wallet_address ?? null,
  solanaCluster: row.solana_cluster ?? null,
  solanaWalletConnectedAt: row.solana_wallet_connected_at
    ? new Date(row.solana_wallet_connected_at).toISOString()
    : null,
});

const normalizeSolanaPubkey = (value: string): string => {
  try {
    // PublicKey constructor validates base58 and length.
    return new PublicKey(value).toBase58();
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_SOLANA_WALLET_ADDRESS" });
  }
};

const normalizeSolanaCluster = (value: string): "devnet" | "testnet" | "mainnet-beta" => {
  const v = value.trim().toLowerCase();
  if (v === "devnet" || v === "testnet" || v === "mainnet-beta") return v;
  throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_SOLANA_CLUSTER" });
};

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
   * Public user identity (PII-free) for opening profiles from comments/leaderboard.
   */
  publicUser: publicProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .output(
      z.object({
        id: z.string(),
        username: z.string(),
        displayName: z.string().nullable(),
        avatarUrl: z.string().nullable(),
        telegramPhotoUrl: z.string().nullable(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const { data, error } = await supabase
        .from("users_public")
        .select("id, username, display_name, avatar_url, telegram_photo_url")
        .eq("id", input.userId)
        .maybeSingle();

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      if (!data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const row = data as UsersPublicRow;
      return {
        id: row.id,
        username: row.username,
        displayName: row.display_name ?? null,
        avatarUrl: row.avatar_url ?? null,
        telegramPhotoUrl: row.telegram_photo_url ?? null,
      };
    }),

  /**
   * Public user summary stats (PII-free): PnL and rank data from leaderboard_public.
   */
  publicUserStats: publicProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .output(
      z.object({
        pnlMajor: z.number(),
        betCount: z.number(),
        rank: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const { data, error } = await supabase
        .from("leaderboard_public")
        .select("pnl_minor, bet_count, rank")
        .eq("user_id", input.userId)
        .maybeSingle();

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      if (!data) {
        return { pnlMajor: 0, betCount: 0, rank: 0 };
      }

      const row = data as Pick<LeaderboardRow, "pnl_minor" | "bet_count" | "rank">;
      return {
        pnlMajor: toMajorUnits(Number(row.pnl_minor ?? 0), VCOIN_DECIMALS),
        betCount: Number(row.bet_count ?? 0),
        rank: Number(row.rank ?? 0),
      };
    }),

  /**
   * Public PnL series (daily deltas, aggregated; no raw transactions).
   */
  publicUserPnlSeries: publicProcedure
    .input(z.object({ userId: z.string().uuid(), limitDays: z.number().min(1).max(365).optional() }))
    .output(
      z.array(
        z.object({
          day: z.string(),
          pnlMajor: z.number(),
        })
      )
    )
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const limitDays = input.limitDays ?? 90;

      const { data, error } = await supabase
        .from("user_pnl_daily_public")
        .select("user_id, day, pnl_minor")
        .eq("user_id", input.userId)
        .order("day", { ascending: true })
        .limit(limitDays);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      const rows = (data ?? []) as UserPnlDailyRow[];
      return rows.map((r) => ({
        day: new Date(r.day).toISOString(),
        pnlMajor: toMajorUnits(Number(r.pnl_minor ?? 0), VCOIN_DECIMALS),
      }));
    }),

  /**
   * Public list of markets the user voted for (no wallet amounts).
   */
  publicUserVotes: publicProcedure
    .input(z.object({ userId: z.string().uuid(), limit: z.number().min(1).max(500).optional() }))
    .output(
      z.array(
        z.object({
          marketId: z.string(),
          outcome: z.enum(["YES", "NO"]),
          lastBetAt: z.string(),
          isActive: z.boolean(),
        })
      )
    )
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const limit = input.limit ?? 100;

      const { data, error } = await supabase
        .from("user_market_bets_public")
        .select("user_id, market_id, outcome, last_bet_at, is_active, position_updated_at")
        .eq("user_id", input.userId)
        .order("last_bet_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      const rows = (data ?? []) as UserMarketBetRow[];
      return rows.map((r) => ({
        marketId: r.market_id,
        outcome: r.outcome as "YES" | "NO",
        lastBetAt: new Date(r.last_bet_at).toISOString(),
        isActive: Boolean((r as { is_active?: boolean }).is_active),
      }));
    }),

  /**
   * Public comments by user (PII-free; content is already public).
   */
  publicUserComments: publicProcedure
    .input(z.object({ userId: z.string().uuid(), limit: z.number().min(1).max(200).optional() }))
    .output(
      z.array(
        z.object({
          id: z.string(),
          marketId: z.string(),
          parentId: z.string().nullable(),
          body: z.string(),
          createdAt: z.string(),
          likesCount: z.number(),
        })
      )
    )
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const limit = input.limit ?? 50;

      const { data, error } = await supabase
        .from("market_comments_public")
        .select("id, market_id, parent_id, body, created_at, likes_count")
        .eq("user_id", input.userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      const rows = (data ?? []) as Pick<
        MarketCommentPublicRow,
        "id" | "market_id" | "parent_id" | "body" | "created_at" | "likes_count"
      >[];

      return rows.map((c) => ({
        id: c.id,
        marketId: c.market_id,
        parentId: c.parent_id ?? null,
        body: c.body,
        createdAt: new Date(c.created_at).toISOString(),
        likesCount: Number(c.likes_count ?? 0),
      }));
    }),

  /**
   * Public (sanitized) transaction feed for a user: only trading-related kinds.
   */
  publicUserTransactions: publicProcedure
    .input(z.object({ userId: z.string().uuid(), limit: z.number().min(1).max(200).optional() }))
    .output(
      z.array(
        z.object({
          id: z.string(),
          kind: z.string(),
          amountMajor: z.number(),
          marketId: z.string().nullable(),
          marketTitleRu: z.string().nullable(),
          marketTitleEn: z.string().nullable(),
          createdAt: z.string(),
        })
      )
    )
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const limit = input.limit ?? 100;

      const { data, error } = await supabase
        .from("wallet_transactions_public")
        .select("id, user_id, kind, amount_minor, market_id, market_title_rus, market_title_eng, created_at")
        .eq("user_id", input.userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      const rows = (data ?? []) as WalletTxPublicRow[];
      return rows.map((r) => ({
        id: r.id,
        kind: String(r.kind),
        amountMajor: toMajorUnits(Number(r.amount_minor ?? 0), VCOIN_DECIMALS),
        marketId: r.market_id ?? null,
        marketTitleRu: r.market_title_rus ?? r.market_title_eng ?? null,
        marketTitleEn: r.market_title_eng ?? null,
        createdAt: new Date(r.created_at).toISOString(),
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
          sortBy: z.enum(["PNL", "BETS"]).optional(),
        })
        .optional()
    )
    .output(leaderboardUsersSchema)
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const limit = input?.limit ?? 25;
      const sortBy = input?.sortBy ?? "PNL";

      // Fetch more than we need so we can filter out 0 pnl / 0 bets users.
      const fetchLimit = Math.min(500, Math.max(100, limit * 5));

      let q = supabase
        .from("leaderboard_public")
        .select("user_id, name, username, avatar_url, balance_minor, pnl_minor, bet_count, referrals, rank")
        // Stable ordering based on requested sort.
        .order(sortBy === "BETS" ? "bet_count" : "pnl_minor", { ascending: false })
        .order(sortBy === "BETS" ? "pnl_minor" : "bet_count", { ascending: false })
        .order("balance_minor", { ascending: false })
        .order("user_id", { ascending: true })
        .limit(fetchLimit);

      const { data, error } = await q;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows = (data ?? []) as LeaderboardRow[];

      // Hide users with 0 pnl OR 0 bets (require both to be non-zero).
      const filtered = rows.filter((r) => {
        const pnlMinor = Number((r as { pnl_minor?: number | null }).pnl_minor ?? 0);
        const betCount = Number((r as { bet_count?: number | null }).bet_count ?? 0);
        return pnlMinor !== 0 && betCount !== 0;
      });

      return filtered.slice(0, limit).map((r, idx) => {
        const name = (r.name || r.username || "").trim() || "Trader";
        const avatar = r.avatar_url || buildInitialsAvatarDataUrl(name, { bg: "#111111", fg: "#ffffff" });
        return {
          id: r.user_id,
          // Rank is based on current sort + filtering.
          rank: idx + 1,
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

  // ============================================================================
  // Solana Wallet Endpoints
  // ============================================================================

  /**
   * Link a Solana wallet pubkey to the current user.
   * Called from frontend after successful Solana Wallet Adapter connection.
   */
  linkWallet: publicProcedure
    .input(
      z.object({
        solanaWalletAddress: z.string().min(32).max(64),
        solanaCluster: z.enum(["devnet", "testnet", "mainnet-beta"]),
      })
    )
    .output(
      z.object({
        solanaWalletAddress: z.string(),
        solanaCluster: z.enum(["devnet", "testnet", "mainnet-beta"]),
        solanaWalletConnectedAt: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });

      const normalizedAddress = normalizeSolanaPubkey(input.solanaWalletAddress);
      const cluster = normalizeSolanaCluster(input.solanaCluster);

      // Check if this wallet is already linked to another user
      const { data: existingUser, error: existingError } = await supabaseService
        .from("users")
        .select("id, solana_wallet_address")
        .eq("solana_wallet_address", normalizedAddress)
        .neq("id", authUser.id)
        .maybeSingle();

      if (existingError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: existingError.message });
      }
      if (existingUser) {
        throw new TRPCError({ code: "CONFLICT", message: "WALLET_ALREADY_LINKED" });
      }

      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await supabaseService
        .from("users")
        .update({
          solana_wallet_address: normalizedAddress,
          solana_cluster: cluster,
          solana_wallet_connected_at: now,
        })
        .eq("id", authUser.id)
        .select("solana_wallet_address, solana_cluster, solana_wallet_connected_at")
        .single();

      if (updateError || !updated) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: updateError?.message ?? "Failed to link wallet",
        });
      }

      return {
        solanaWalletAddress: String((updated as { solana_wallet_address?: string | null }).solana_wallet_address),
        solanaCluster: normalizeSolanaCluster(String((updated as { solana_cluster?: string | null }).solana_cluster)),
        solanaWalletConnectedAt: new Date(
          String((updated as { solana_wallet_connected_at?: string | null }).solana_wallet_connected_at)
        ).toISOString(),
      };
    }),

  /**
   * Unlink Solana wallet from the current user.
   */
  unlinkWallet: publicProcedure
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });

      const { error: updateError } = await supabaseService
        .from("users")
        .update({
          solana_wallet_address: null,
          solana_cluster: null,
          solana_wallet_connected_at: null,
        })
        .eq("id", authUser.id);

      if (updateError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updateError.message });
      }
      return { success: true };
    }),

  /**
   * Get Solana wallet connection status for the current user.
   */
  getWalletStatus: publicProcedure
    .output(
      z.object({
        isConnected: z.boolean(),
        solanaWalletAddress: z.string().nullable(),
        solanaCluster: z.enum(["devnet", "testnet", "mainnet-beta"]).nullable(),
        solanaWalletConnectedAt: z.string().nullable(),
      })
    )
    .query(async ({ ctx }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });

      const { data, error } = await supabaseService
        .from("users")
        .select("solana_wallet_address, solana_cluster, solana_wallet_connected_at")
        .eq("id", authUser.id)
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Failed to get wallet status",
        });
      }

      const row = data as Pick<UserRow, "solana_wallet_address" | "solana_cluster" | "solana_wallet_connected_at">;
      const cluster = row.solana_cluster ? normalizeSolanaCluster(String(row.solana_cluster)) : null;

      return {
        isConnected: Boolean(row.solana_wallet_address),
        solanaWalletAddress: row.solana_wallet_address ?? null,
        solanaCluster: cluster,
        solanaWalletConnectedAt: row.solana_wallet_connected_at
          ? new Date(row.solana_wallet_connected_at).toISOString()
          : null,
      };
    }),

  /**
   * Update Solana cluster (when user switches networks).
   * Note: procedure name is preserved for API compatibility.
   */
  updateWalletChain: publicProcedure
    .input(z.object({ solanaCluster: z.enum(["devnet", "testnet", "mainnet-beta"]) }))
    .output(z.object({ solanaCluster: z.enum(["devnet", "testnet", "mainnet-beta"]) }))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });

      // Verify user has a wallet linked
      const { data: user, error: userError } = await supabaseService
        .from("users")
        .select("solana_wallet_address")
        .eq("id", authUser.id)
        .single();

      if (userError || !user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: userError?.message ?? "User not found",
        });
      }

      if (!(user as { solana_wallet_address?: string | null }).solana_wallet_address) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "NO_WALLET_LINKED" });
      }

      const cluster = normalizeSolanaCluster(input.solanaCluster);
      const { error: updateError } = await supabaseService
        .from("users")
        .update({ solana_cluster: cluster })
        .eq("id", authUser.id);

      if (updateError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updateError.message });
      }

      return { solanaCluster: cluster };
    }),
});
