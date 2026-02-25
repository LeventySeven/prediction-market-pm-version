import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { publicProcedure, router } from "../trpc";
import { buildInitialsAvatarDataUrl } from "@/lib/avatar";

const VCOIN_DECIMALS = 6;
const DEFAULT_ASSET = "VCOIN";
const toMajorUnits = (minor: number) => minor / Math.pow(10, VCOIN_DECIMALS);

const userShape = z.object({
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
  solanaWalletAddress: z.string().nullable(),
  solanaCluster: z.string().nullable(),
  solanaWalletConnectedAt: z.string().nullable(),
});

const normalizeSolanaPubkey = (value: string): string => {
  try {
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
const buildReferralCode = () => randomBytes(6).toString("hex").toUpperCase();

const mapUser = (row: any, balanceMinor = 0) => ({
  id: String(row.id),
  email: String(row.email ?? ""),
  username: String(row.username ?? ""),
  displayName: row.display_name ? String(row.display_name) : null,
  avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
  telegramPhotoUrl: row.telegram_photo_url ? String(row.telegram_photo_url) : null,
  referralCode: row.referral_code ? String(row.referral_code) : null,
  referralCommissionRate:
    row.referral_commission_rate === null || row.referral_commission_rate === undefined
      ? null
      : Number(row.referral_commission_rate),
  referralEnabled: row.referral_enabled === null || row.referral_enabled === undefined ? null : Boolean(row.referral_enabled),
  balance: toMajorUnits(Number(balanceMinor ?? 0)),
  createdAt: new Date(String(row.created_at ?? new Date().toISOString())).toISOString(),
  isAdmin: Boolean(row.is_admin),
  solanaWalletAddress: row.solana_wallet_address ? String(row.solana_wallet_address) : null,
  solanaCluster: row.solana_cluster ? String(row.solana_cluster) : null,
  solanaWalletConnectedAt: row.solana_wallet_connected_at
    ? new Date(String(row.solana_wallet_connected_at)).toISOString()
    : null,
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
    .output(userShape)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService } = ctx;
      const email = input.email.trim().toLowerCase();
      const username = input.username.trim();
      const displayName = input.displayName?.trim() || username;

      const existing = await (supabaseService as any)
        .from("users")
        .select("*")
        .eq("email", email)
        .maybeSingle();
      if (existing.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: existing.error.message });
      if (existing.data) {
        const wallet = await (supabaseService as any)
          .from("wallet_balances")
          .select("balance_minor")
          .eq("user_id", existing.data.id)
          .eq("asset_code", DEFAULT_ASSET)
          .maybeSingle();
        return mapUser(existing.data, wallet.data?.balance_minor ?? 0);
      }

      const created = await (supabaseService as any)
        .from("users")
        .insert({
          email,
          username,
          display_name: displayName,
          avatar_url: buildInitialsAvatarDataUrl(displayName || username, { bg: "#222222", fg: "#ffffff" }),
        })
        .select("*")
        .single();
      if (created.error || !created.data) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: created.error?.message ?? "Failed to register user" });
      }
      await (supabaseService as any).from("wallet_balances").upsert(
        {
          user_id: created.data.id,
          asset_code: DEFAULT_ASSET,
          balance_minor: 0,
        },
        { onConflict: "user_id,asset_code", ignoreDuplicates: true }
      );
      return mapUser(created.data, 0);
    }),

  getMe: publicProcedure.output(userShape).query(async ({ ctx }) => {
    const { supabaseService, authUser } = ctx;
    if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    const user = await (supabaseService as any).from("users").select("*").eq("id", authUser.id).maybeSingle();
    if (user.error || !user.data) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    const wallet = await (supabaseService as any)
      .from("wallet_balances")
      .select("balance_minor")
      .eq("user_id", authUser.id)
      .eq("asset_code", DEFAULT_ASSET)
      .maybeSingle();
    return mapUser(user.data, wallet.data?.balance_minor ?? 0);
  }),

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
    .query(async () => []),

  publicUser: publicProcedure
    .input(z.object({ userId: z.string() }))
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
      const { supabaseService } = ctx;
      const row = await (supabaseService as any)
        .from("users")
        .select("id, username, display_name, avatar_url, telegram_photo_url")
        .eq("id", input.userId)
        .maybeSingle();
      if (row.error || !row.data) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      return {
        id: String(row.data.id),
        username: String(row.data.username ?? ""),
        displayName: row.data.display_name ? String(row.data.display_name) : null,
        avatarUrl: row.data.avatar_url ? String(row.data.avatar_url) : null,
        telegramPhotoUrl: row.data.telegram_photo_url ? String(row.data.telegram_photo_url) : null,
      };
    }),

  publicUserStats: publicProcedure
    .input(z.object({ userId: z.string() }))
    .output(
      z.object({
        userId: z.string(),
        pnlMajor: z.number(),
        betsCount: z.number(),
      })
    )
    .query(async ({ input }) => ({
      userId: input.userId,
      pnlMajor: 0,
      betsCount: 0,
    })),

  publicUserPnlSeries: publicProcedure
    .input(z.object({ userId: z.string(), days: z.number().int().positive().max(365).optional() }))
    .output(z.array(z.object({ day: z.string(), pnlMajor: z.number() })))
    .query(async () => []),

  publicUserVotes: publicProcedure
    .input(z.object({ userId: z.string(), limit: z.number().int().positive().max(500).optional() }))
    .output(
      z.array(
        z.object({
          marketId: z.string(),
          outcome: z.enum(["YES", "NO"]).nullable(),
          lastBetAt: z.string(),
          isActive: z.boolean(),
        })
      )
    )
    .query(async () => []),

  publicUserComments: publicProcedure
    .input(z.object({ userId: z.string(), limit: z.number().int().positive().max(500).optional() }))
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
      const { supabaseService } = ctx;
      const limit = input.limit ?? 100;
      const comments = await (supabaseService as any)
        .from("market_comments")
        .select("id, market_id, parent_id, body, created_at")
        .eq("user_id", input.userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (comments.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: comments.error.message });
      const rows = comments.data ?? [];
      const likes = await (supabaseService as any)
        .from("market_comment_likes")
        .select("comment_id")
        .in("comment_id", rows.map((r: any) => r.id));
      const likesByComment = new Map<string, number>();
      for (const like of likes.data ?? []) {
        const key = String((like as any).comment_id);
        likesByComment.set(key, (likesByComment.get(key) ?? 0) + 1);
      }
      return rows.map((r: any) => ({
        id: String(r.id),
        marketId: String(r.market_id),
        parentId: r.parent_id ? String(r.parent_id) : null,
        body: String(r.body ?? ""),
        createdAt: new Date(String(r.created_at)).toISOString(),
        likesCount: likesByComment.get(String(r.id)) ?? 0,
      }));
    }),

  publicUserTransactions: publicProcedure
    .input(z.object({ userId: z.string(), limit: z.number().int().positive().max(500).optional() }))
    .output(z.array(z.object({ id: z.string() })))
    .query(async () => []),

  updateDisplayName: publicProcedure
    .input(z.object({ displayName: z.string().min(2).max(32) }))
    .output(userShape)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const displayName = normalizeDisplayName(input.displayName);
      const updated = await (supabaseService as any)
        .from("users")
        .update({ display_name: displayName })
        .eq("id", authUser.id)
        .select("*")
        .single();
      if (updated.error || !updated.data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updated.error?.message ?? "Failed to update display name" });
      const wallet = await (supabaseService as any)
        .from("wallet_balances")
        .select("balance_minor")
        .eq("user_id", authUser.id)
        .eq("asset_code", DEFAULT_ASSET)
        .maybeSingle();
      return mapUser(updated.data, wallet.data?.balance_minor ?? 0);
    }),

  updateAvatarUrl: publicProcedure
    .input(z.object({ avatarUrl: z.string().url().nullable() }))
    .output(userShape)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const updated = await (supabaseService as any)
        .from("users")
        .update({ avatar_url: input.avatarUrl })
        .eq("id", authUser.id)
        .select("*")
        .single();
      if (updated.error || !updated.data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updated.error?.message ?? "Failed to update avatar" });
      const wallet = await (supabaseService as any)
        .from("wallet_balances")
        .select("balance_minor")
        .eq("user_id", authUser.id)
        .eq("asset_code", DEFAULT_ASSET)
        .maybeSingle();
      return mapUser(updated.data, wallet.data?.balance_minor ?? 0);
    }),

  createReferralLink: publicProcedure
    .output(
      z.object({
        referralCode: z.string(),
        referralCommissionRate: z.number().nullable(),
        referralEnabled: z.boolean().nullable(),
      })
    )
    .mutation(async ({ ctx }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const user = await (supabaseService as any)
        .from("users")
        .select("id, referral_code")
        .eq("id", authUser.id)
        .maybeSingle();
      if (user.error || !user.data) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      const existing = user.data.referral_code ? String(user.data.referral_code) : null;
      if (existing) {
        const full = await (supabaseService as any)
          .from("users")
          .select("referral_commission_rate, referral_enabled")
          .eq("id", authUser.id)
          .maybeSingle();
        return {
          referralCode: existing,
          referralCommissionRate:
            full.data?.referral_commission_rate === null || full.data?.referral_commission_rate === undefined
              ? null
              : Number(full.data.referral_commission_rate),
          referralEnabled:
            full.data?.referral_enabled === null || full.data?.referral_enabled === undefined
              ? null
              : Boolean(full.data.referral_enabled),
        };
      }
      const code = buildReferralCode();
      const updated = await (supabaseService as any)
        .from("users")
        .update({ referral_code: code, referral_enabled: true })
        .eq("id", authUser.id)
        .select("referral_code, referral_commission_rate, referral_enabled")
        .single();
      if (updated.error || !updated.data?.referral_code) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updated.error?.message ?? "Failed to create referral code" });
      return {
        referralCode: String(updated.data.referral_code),
        referralCommissionRate:
          updated.data.referral_commission_rate === null || updated.data.referral_commission_rate === undefined
            ? null
            : Number(updated.data.referral_commission_rate),
        referralEnabled:
          updated.data.referral_enabled === null || updated.data.referral_enabled === undefined
            ? null
            : Boolean(updated.data.referral_enabled),
      };
    }),

  leaderboard: publicProcedure
    .input(z.object({ limit: z.number().int().positive().max(500).optional(), sortBy: z.enum(["pnl", "bets"]).optional() }).optional())
    .output(
      z.array(
        z.object({
          id: z.string(),
          rank: z.number(),
          name: z.string(),
          username: z.string().optional(),
          avatar: z.string(),
          balance: z.number(),
          pnl: z.number(),
          referrals: z.number().optional(),
          betCount: z.number().optional(),
        })
      )
    )
    .query(async ({ ctx, input }) => {
      const { supabaseService } = ctx;
      const limit = input?.limit ?? 100;
      const users = await (supabaseService as any)
        .from("users")
        .select("id, username, display_name, avatar_url, telegram_photo_url, created_at")
        .order("created_at", { ascending: true })
        .limit(limit);
      if (users.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: users.error.message });
      const rows = users.data ?? [];
      const ids = rows.map((u: any) => String(u.id));
      const balances = ids.length
        ? await (supabaseService as any).from("wallet_balances").select("user_id, balance_minor").in("user_id", ids).eq("asset_code", DEFAULT_ASSET)
        : { data: [] as any[] };
      const byUser = new Map<string, number>();
      for (const b of balances.data ?? []) byUser.set(String((b as any).user_id), Number((b as any).balance_minor ?? 0));
      return rows.map((u: any, idx: number) => ({
        id: String(u.id),
        rank: idx + 1,
        name: String(u.display_name ?? u.username ?? "User"),
        username: u.username ? String(u.username) : undefined,
        avatar: String(u.avatar_url ?? u.telegram_photo_url ?? buildInitialsAvatarDataUrl(String(u.display_name ?? u.username ?? "U"), { bg: "#222222", fg: "#ffffff" })),
        balance: toMajorUnits(byUser.get(String(u.id)) ?? 0),
        pnl: 0,
        referrals: 0,
        betCount: 0,
      }));
    }),

  linkWallet: publicProcedure
    .input(
      z.object({
        solanaWalletAddress: z.string().min(32).max(64),
        solanaCluster: z.string().optional(),
      })
    )
    .output(
      z.object({
        solanaWalletAddress: z.string().nullable(),
        solanaCluster: z.string().nullable(),
        solanaWalletConnectedAt: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const normalized = normalizeSolanaPubkey(input.solanaWalletAddress);
      const cluster = normalizeSolanaCluster(input.solanaCluster || "devnet");
      const nowIso = new Date().toISOString();
      const collision = await (supabaseService as any)
        .from("users")
        .select("id")
        .eq("solana_wallet_address", normalized)
        .neq("id", authUser.id)
        .maybeSingle();
      if (collision.data) throw new TRPCError({ code: "CONFLICT", message: "WALLET_ALREADY_LINKED" });
      const updated = await (supabaseService as any)
        .from("users")
        .update({
          solana_wallet_address: normalized,
          solana_cluster: cluster,
          solana_wallet_connected_at: nowIso,
        })
        .eq("id", authUser.id)
        .select("solana_wallet_address, solana_cluster, solana_wallet_connected_at")
        .single();
      if (updated.error || !updated.data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updated.error?.message ?? "Failed to link wallet" });
      return {
        solanaWalletAddress: String(updated.data.solana_wallet_address),
        solanaCluster: String(updated.data.solana_cluster),
        solanaWalletConnectedAt: new Date(String(updated.data.solana_wallet_connected_at)).toISOString(),
      };
    }),

  unlinkWallet: publicProcedure
    .output(
      z.object({
        solanaWalletAddress: z.string().nullable(),
        solanaCluster: z.string().nullable(),
        solanaWalletConnectedAt: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const updated = await (supabaseService as any)
        .from("users")
        .update({
          solana_wallet_address: null,
          solana_cluster: null,
          solana_wallet_connected_at: null,
        })
        .eq("id", authUser.id)
        .select("solana_wallet_address, solana_cluster, solana_wallet_connected_at")
        .single();
      if (updated.error || !updated.data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updated.error?.message ?? "Failed to unlink wallet" });
      return {
        solanaWalletAddress: null,
        solanaCluster: null,
        solanaWalletConnectedAt: null,
      };
    }),

  getWalletStatus: publicProcedure
    .output(
      z.object({
        solanaWalletAddress: z.string().nullable(),
        solanaCluster: z.string().nullable(),
        solanaWalletConnectedAt: z.string().nullable(),
      })
    )
    .query(async ({ ctx }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const row = await (supabaseService as any)
        .from("users")
        .select("solana_wallet_address, solana_cluster, solana_wallet_connected_at")
        .eq("id", authUser.id)
        .maybeSingle();
      if (row.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: row.error.message });
      return {
        solanaWalletAddress: row.data?.solana_wallet_address ? String(row.data.solana_wallet_address) : null,
        solanaCluster: row.data?.solana_cluster ? String(row.data.solana_cluster) : null,
        solanaWalletConnectedAt: row.data?.solana_wallet_connected_at ? new Date(String(row.data.solana_wallet_connected_at)).toISOString() : null,
      };
    }),

  updateWalletChain: publicProcedure
    .input(z.object({ solanaCluster: z.string() }))
    .output(
      z.object({
        solanaWalletAddress: z.string().nullable(),
        solanaCluster: z.string().nullable(),
        solanaWalletConnectedAt: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const cluster = normalizeSolanaCluster(input.solanaCluster);
      const updated = await (supabaseService as any)
        .from("users")
        .update({ solana_cluster: cluster })
        .eq("id", authUser.id)
        .select("solana_wallet_address, solana_cluster, solana_wallet_connected_at")
        .single();
      if (updated.error || !updated.data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updated.error?.message ?? "Failed to update chain" });
      return {
        solanaWalletAddress: updated.data.solana_wallet_address ? String(updated.data.solana_wallet_address) : null,
        solanaCluster: updated.data.solana_cluster ? String(updated.data.solana_cluster) : null,
        solanaWalletConnectedAt: updated.data.solana_wallet_connected_at ? new Date(String(updated.data.solana_wallet_connected_at)).toISOString() : null,
      };
    }),
});

