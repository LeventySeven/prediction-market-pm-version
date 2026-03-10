import "server-only";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "node:crypto";
import { publicProcedure, router } from "../trpc";
import { buildInitialsAvatarDataUrl } from "@/lib/avatar";
import { sanitizeAvatarPalette } from "@/src/lib/avatarPalette";
import { DEFAULT_LEADERBOARD_LIMIT } from "@/src/lib/constants";
import { authCookie, signAuthToken } from "../../auth/jwt";
import {
  isPlaceholderDisplayName,
  isPlaceholderPrivyUsername,
  isValidUsername,
  normalizeDisplayName,
  normalizeUsername,
} from "../../auth/identity";
import {
  avatarPaletteShape,
  checkUsernameAvailabilityInput,
  completeProfileSetupInput,
  createReferralLinkOutput,
  leaderboardInput,
  leaderboardOutput,
  publicUserCommentsInput,
  publicUserCommentsOutput,
  publicUserInput,
  publicUserOutput,
  publicUserStatsInput,
  publicUserStatsOutput,
  publicUserVotesInput,
  publicUserVotesOutput,
  updateAvatarUrlInput,
  updateDisplayNameInput,
  updateProfileIdentityInput,
  userShape,
  usernameAvailabilityOutput,
} from "@/src/lib/validations/user";

const PRIVY_PLACEHOLDER_DOMAIN = "@privy.local";

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

const normalizeHandleInput = (value: string) => normalizeUsername(value);

const isProfileIdentityComplete = (row: any): boolean => {
  const provider = String(row.auth_provider ?? "").toLowerCase();
  if (provider !== "privy") return true;

  const username = normalizeHandleInput(String(row.username ?? ""));
  const displayName = normalizeDisplayName(String(row.display_name ?? ""));
  const usernameValid = isValidUsername(username) && !isPlaceholderPrivyUsername(username);
  const displayNameValid = displayName.length >= 2 && !isPlaceholderDisplayName(displayName);

  return Boolean(row.profile_setup_completed_at) && usernameValid && displayNameValid;
};

const issueUserAuthCookie = async (
  setCookie: (value: string) => void,
  row: {
    id: string;
    email: string;
    username: string;
    is_admin: boolean | null;
  }
) => {
  const token = await signAuthToken({
    sub: String(row.id),
    email: String(row.email),
    username: String(row.username),
    isAdmin: Boolean(row.is_admin),
  });
  setCookie(authCookie(token));
};

const mapUser = (row: any) => ({
  id: String(row.id),
  email: String(row.email ?? ""),
  username: String(row.username ?? ""),
  displayName: row.display_name ? String(row.display_name) : null,
  avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
  profileDescription: row.profile_description ? String(row.profile_description) : null,
  avatarPalette: sanitizeAvatarPalette(row.avatar_palette),
  needsProfileSetup: !isProfileIdentityComplete(row),
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

const requireServiceRoleForUserWrite = (hasServiceRole: boolean) => {
  if (hasServiceRole) return;
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "SERVICE_ROLE_UNAVAILABLE",
  });
};

export const userRouter = router({
  publicUser: publicProcedure
    .input(publicUserInput)
    .output(publicUserOutput)
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
    .input(publicUserStatsInput)
    .output(publicUserStatsOutput)
    .query(async ({ input }) => ({
      userId: input.userId,
      pnlMajor: 0,
      betsCount: 0,
    })),

  publicUserVotes: publicProcedure
    .input(publicUserVotesInput)
    .output(publicUserVotesOutput)
    .query(async () => []),

  publicUserComments: publicProcedure
    .input(publicUserCommentsInput)
    .output(publicUserCommentsOutput)
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

  checkUsernameAvailability: publicProcedure
    .input(checkUsernameAvailabilityInput)
    .output(usernameAvailabilityOutput)
    .query(async ({ ctx, input }) => {
      const normalized = normalizeHandleInput(input.username);
      if (!isValidUsername(normalized)) {
        return { available: false, normalized, reason: "INVALID_FORMAT" };
      }
      if (isPlaceholderPrivyUsername(normalized)) {
        return { available: false, normalized, reason: "RESERVED" };
      }

      try {
        const existing = await (ctx.supabaseService as any)
          .from("users")
          .select("id")
          .eq("username", normalized)
          .maybeSingle();
        if (existing.error) {
          return { available: false, normalized, reason: "CHECK_FAILED" };
        }
        if (!existing.data) {
          return { available: true, normalized };
        }
        if (ctx.authUser && String(existing.data.id ?? "") === ctx.authUser.id) {
          return { available: true, normalized, reason: "UNCHANGED" };
        }
        return { available: false, normalized, reason: "TAKEN" };
      } catch {
        return { available: false, normalized, reason: "CHECK_FAILED" };
      }
    }),

  updateDisplayName: publicProcedure
    .input(updateDisplayNameInput)
    .output(userShape)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      requireServiceRoleForUserWrite(Boolean(ctx.hasServiceRole));
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

  updateProfileIdentity: publicProcedure
    .input(updateProfileIdentityInput)
    .output(userShape)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      requireServiceRoleForUserWrite(Boolean(ctx.hasServiceRole));

      const normalizedUsername = normalizeHandleInput(input.username);
      const displayName = normalizeDisplayName(input.displayName);
      if (!isValidUsername(normalizedUsername)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_USERNAME_FORMAT" });
      }
      if (isPlaceholderPrivyUsername(normalizedUsername)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "USERNAME_RESERVED" });
      }
      if (displayName.length < 2 || isPlaceholderDisplayName(displayName)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_DISPLAY_NAME" });
      }

      const updated = await (supabaseService as any)
        .from("users")
        .update({
          username: normalizedUsername,
          display_name: displayName,
          profile_setup_completed_at: new Date().toISOString(),
        })
        .eq("id", authUser.id)
        .select("*")
        .single();

      if (updated.error || !updated.data) {
        const code = String((updated.error as any)?.code ?? "");
        const message = String(updated.error?.message ?? "").toLowerCase();
        if (code === "23505" || message.includes("username")) {
          throw new TRPCError({ code: "CONFLICT", message: "USERNAME_TAKEN" });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: updated.error?.message ?? "Failed to update profile identity",
        });
      }

      if (normalizedUsername !== authUser.username) {
        await issueUserAuthCookie(ctx.setCookie, updated.data);
      }

      return mapUser(updated.data);
    }),

  updateAvatarUrl: publicProcedure
    .input(updateAvatarUrlInput)
    .output(userShape)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      requireServiceRoleForUserWrite(Boolean(ctx.hasServiceRole));
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
    .input(completeProfileSetupInput)
    .output(userShape)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      requireServiceRoleForUserWrite(Boolean(ctx.hasServiceRole));

      const normalizedUsername = normalizeHandleInput(input.username);
      const displayName = normalizeDisplayName(input.displayName);
      if (!isValidUsername(normalizedUsername)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_USERNAME_FORMAT" });
      }
      if (isPlaceholderPrivyUsername(normalizedUsername)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "USERNAME_RESERVED" });
      }
      if (displayName.length < 2 || isPlaceholderDisplayName(displayName)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_DISPLAY_NAME" });
      }
      const nextEmail = normalizeEmail(input.email);
      const description = normalizeDescription(input.profileDescription);
      const existing = await (supabaseService as any)
        .from("users")
        .select("email, username, is_admin")
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
        username: normalizedUsername,
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
        const message = String(updated.error?.message ?? "").toLowerCase();
        if (code === "23505") {
          if (message.includes("username")) {
            throw new TRPCError({ code: "CONFLICT", message: "USERNAME_TAKEN" });
          }
          throw new TRPCError({ code: "CONFLICT", message: "EMAIL_ALREADY_IN_USE" });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: updated.error?.message ?? "Failed to complete profile setup",
        });
      }

      if (normalizedUsername !== authUser.username) {
        await issueUserAuthCookie(ctx.setCookie, updated.data);
      }
      return mapUser(updated.data);
    }),

  createReferralLink: publicProcedure
    .output(createReferralLinkOutput)
    .mutation(async ({ ctx }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      requireServiceRoleForUserWrite(Boolean(ctx.hasServiceRole));
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
    .input(leaderboardInput)
    .output(leaderboardOutput)
    .query(async ({ ctx, input }) => {
      const { supabaseService } = ctx;
      const limit = input?.limit ?? DEFAULT_LEADERBOARD_LIMIT;
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
