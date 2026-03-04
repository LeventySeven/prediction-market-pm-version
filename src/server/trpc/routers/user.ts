import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { publicProcedure, router } from "../trpc";
import { buildInitialsAvatarDataUrl } from "@/lib/avatar";
import { sanitizeAvatarPalette } from "@/src/lib/avatarPalette";

const PRIVY_PLACEHOLDER_DOMAIN = "@privy.local";
const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
const avatarPaletteShape = z.object({
  primary: z.string().regex(hexColorRegex),
  secondary: z.string().regex(hexColorRegex),
});

const userShape = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  profileDescription: z.string().nullable(),
  avatarPalette: avatarPaletteShape.nullable(),
  needsProfileSetup: z.boolean(),
  telegramPhotoUrl: z.string().nullable(),
  referralCode: z.string().nullable(),
  referralCommissionRate: z.number().nullable(),
  referralEnabled: z.boolean().nullable(),
  balance: z.number(),
  createdAt: z.string(),
  isAdmin: z.boolean(),
});

const normalizeDisplayName = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizeDescription = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
};
const normalizeEmail = (value: string | undefined) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};
const isPrivyPlaceholderEmail = (value: string) => value.trim().toLowerCase().endsWith(PRIVY_PLACEHOLDER_DOMAIN);
const buildReferralCode = () => randomBytes(6).toString("hex").toUpperCase();

const mapUser = (row: any) => ({
  id: String(row.id),
  email: String(row.email ?? ""),
  username: String(row.username ?? ""),
  displayName: row.display_name ? String(row.display_name) : null,
  avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
  profileDescription: row.profile_description ? String(row.profile_description) : null,
  avatarPalette: sanitizeAvatarPalette(row.avatar_palette),
  needsProfileSetup: String(row.auth_provider ?? "").toLowerCase() === "privy" && !row.profile_setup_completed_at,
  telegramPhotoUrl: row.telegram_photo_url ? String(row.telegram_photo_url) : null,
  referralCode: row.referral_code ? String(row.referral_code) : null,
  referralCommissionRate:
    row.referral_commission_rate === null || row.referral_commission_rate === undefined
      ? null
      : Number(row.referral_commission_rate),
  referralEnabled: row.referral_enabled === null || row.referral_enabled === undefined ? null : Boolean(row.referral_enabled),
  balance: 0,
  createdAt: new Date(String(row.created_at ?? new Date().toISOString())).toISOString(),
  isAdmin: Boolean(row.is_admin),
});

export const userRouter = router({
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
      return mapUser(updated.data);
    }),

  updateAvatarUrl: publicProcedure
    .input(z.object({ avatarUrl: z.string().url().nullable(), avatarPalette: avatarPaletteShape.nullable().optional() }))
    .output(userShape)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const updatePayload: Record<string, unknown> = {
        avatar_url: input.avatarUrl,
      };
      if (input.avatarUrl === null) {
        updatePayload.avatar_palette = null;
      } else if (input.avatarPalette !== undefined) {
        updatePayload.avatar_palette = input.avatarPalette;
      }
      const updated = await (supabaseService as any)
        .from("users")
        .update(updatePayload)
        .eq("id", authUser.id)
        .select("*")
        .single();
      if (updated.error || !updated.data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updated.error?.message ?? "Failed to update avatar" });
      return mapUser(updated.data);
    }),

  completeProfileSetup: publicProcedure
    .input(
      z.object({
        displayName: z.string().min(2).max(32),
        email: z.string().trim().email().max(254).optional(),
        profileDescription: z.string().max(280).nullable().optional(),
        avatarUrl: z.string().url().nullable().optional(),
        avatarPalette: avatarPaletteShape.nullable().optional(),
      })
    )
    .output(userShape)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });

      const displayName = normalizeDisplayName(input.displayName);
      const nextEmail = normalizeEmail(input.email);
      const description = normalizeDescription(input.profileDescription);
      const existing = await (supabaseService as any)
        .from("users")
        .select("email")
        .eq("id", authUser.id)
        .maybeSingle();

      if (existing.error || !existing.data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: existing.error?.message ?? "User not found",
        });
      }

      const currentEmail = String(existing.data.email ?? "");
      const updatePayload: Record<string, unknown> = {
        display_name: displayName,
        profile_description: description,
        profile_setup_completed_at: new Date().toISOString(),
        email:
          nextEmail ??
          (isPrivyPlaceholderEmail(currentEmail)
            ? currentEmail
            : currentEmail.toLowerCase()),
      };

      if (input.avatarUrl !== undefined) {
        updatePayload.avatar_url = input.avatarUrl;
        if (input.avatarUrl === null) {
          updatePayload.avatar_palette = null;
        } else if (input.avatarPalette !== undefined) {
          updatePayload.avatar_palette = input.avatarPalette;
        }
      } else if (input.avatarPalette !== undefined) {
        updatePayload.avatar_palette = input.avatarPalette;
      }

      const updated = await (supabaseService as any)
        .from("users")
        .update(updatePayload)
        .eq("id", authUser.id)
        .select("*")
        .single();

      if (updated.error || !updated.data) {
        const code = String((updated.error as any)?.code ?? "");
        if (code === "23505") {
          throw new TRPCError({ code: "CONFLICT", message: "EMAIL_ALREADY_IN_USE" });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: updated.error?.message ?? "Failed to complete profile setup",
        });
      }
      return mapUser(updated.data);
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
      return rows.map((u: any, idx: number) => ({
        id: String(u.id),
        rank: idx + 1,
        name: String(u.display_name ?? u.username ?? "User"),
        username: u.username ? String(u.username) : undefined,
        avatar: String(u.avatar_url ?? u.telegram_photo_url ?? buildInitialsAvatarDataUrl(String(u.display_name ?? u.username ?? "U"), { bg: "#222222", fg: "#ffffff" })),
        balance: 0,
        pnl: 0,
        referrals: 0,
        betCount: 0,
      }));
    }),

});
