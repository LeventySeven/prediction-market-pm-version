import "server-only";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "node:crypto";
import { csrfPublicMutation, publicProcedure, router } from "../trpc";
import { authCookie, clearAuthCookie, signAuthToken, verifyAuthToken } from "../../auth/jwt";
import type { PublicUser } from "../../auth/types";
import type { Database } from "../../../types/database";
import { verifyPrivyAccessToken } from "../../auth/privy";
import { consumeDurableRateLimit } from "../../security/rateLimit";
import { getTrustedClientIpFromRequest } from "../../http/ip";
import { sanitizeAvatarPalette } from "@/src/lib/avatarPalette";
import {
  isPlaceholderDisplayName,
  isPlaceholderPrivyUsername,
  isValidUsername,
  normalizeDisplayName,
  normalizeUsername,
} from "../../auth/identity";
import { privyLoginInput } from "@/src/lib/validations/auth";

const publicColumns =
  "id, email, username, display_name, avatar_url, profile_description, avatar_palette, profile_setup_completed_at, telegram_photo_url, referral_code, referral_commission_rate, referral_enabled, created_at, is_admin, privy_user_id, privy_wallet_address, auth_provider";

type DbUserRow = Database["public"]["Tables"]["users"]["Row"];
type UserInsert = Database["public"]["Tables"]["users"]["Insert"];

/** Normalize an email for consistent lookup: trim whitespace and lowercase. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const PRIVY_PLACEHOLDER_DOMAIN = "privy.local";
const buildPrivyEmail = (privyUserId: string) => `privy_${privyUserId}@${PRIVY_PLACEHOLDER_DOMAIN}`;

const buildPrivyUsername = (privyUserId: string) =>
  normalizeUsername(`privy_${privyUserId}`) || `privy_${randomBytes(4).toString("hex")}`;

const needsProfileSetup = (row: DbUserRow): boolean => {
  if (row.auth_provider !== "privy") return false;
  const username = normalizeUsername(String(row.username ?? ""));
  const displayName = normalizeDisplayName(String(row.display_name ?? ""));
  const usernameValid = isValidUsername(username) && !isPlaceholderPrivyUsername(username);
  const displayNameValid = displayName.length >= 2 && !isPlaceholderDisplayName(displayName);
  return !row.profile_setup_completed_at || !usernameValid || !displayNameValid;
};

const toPublicUser = (row: DbUserRow): PublicUser => ({
  id: String(row.id),
  email: row.email,
  username: row.username,
  displayName: row.display_name,
  avatarUrl: row.avatar_url ?? null,
  profileDescription: row.profile_description ?? null,
  avatarPalette: sanitizeAvatarPalette(row.avatar_palette),
  needsProfileSetup: needsProfileSetup(row),
  telegramPhotoUrl: row.telegram_photo_url ?? null,
  referralCode: row.referral_code,
  referralCommissionRate:
    row.referral_commission_rate === null || row.referral_commission_rate === undefined
      ? null
      : Number(row.referral_commission_rate),
  referralEnabled: row.referral_enabled,
  balance: 0,
  createdAt: new Date(row.created_at).toISOString(),
  isAdmin: Boolean(row.is_admin),
  privyUserId: row.privy_user_id ?? null,
  walletAddress: row.privy_wallet_address ?? null,
});

const issueAuthCookie = async (setCookie: (value: string) => void, row: DbUserRow) => {
  const token = await signAuthToken({
    sub: String(row.id),
    email: row.email,
    username: row.username,
    isAdmin: Boolean(row.is_admin),
  });
  setCookie(authCookie(token));
};

const isDuplicateError = (error: { code?: unknown; message?: unknown } | null | undefined): boolean => {
  const code = String(error?.code ?? "").trim();
  if (code === "23505") return true;
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("duplicate");
};

const findUserByPrivyWallet = async (
  supabaseService: {
    from: (table: string) => {
      select: (columns: string) => any;
    };
  },
  walletAddress: string | null
): Promise<DbUserRow | null> => {
  if (!walletAddress) return null;
  const byWallet = await supabaseService
    .from("users")
    .select(publicColumns)
    .eq("privy_wallet_address", walletAddress)
    .maybeSingle();
  if (byWallet.error || !byWallet.data) return null;
  return byWallet.data as DbUserRow;
};

const needsPrivyLinkUpdate = (
  row: DbUserRow,
  identity: { privyUserId: string; walletAddress: string | null }
): boolean =>
  row.privy_user_id !== identity.privyUserId ||
  (row.privy_wallet_address ?? null) !== identity.walletAddress ||
  row.auth_provider !== "privy";

const resolvePrivyUserConflict = async (
  supabaseService: {
    from: (table: string) => {
      select: (columns: string) => any;
      update: (values: Database["public"]["Tables"]["users"]["Update"]) => any;
    };
  },
  identity: { privyUserId: string; walletAddress: string | null; email: string | null }
): Promise<DbUserRow | null> => {
  const byPrivy = await supabaseService
    .from("users")
    .select(publicColumns)
    .eq("privy_user_id", identity.privyUserId)
    .maybeSingle();
  if (!byPrivy.error && byPrivy.data) {
    return byPrivy.data as DbUserRow;
  }

  const byWallet = await findUserByPrivyWallet(supabaseService, identity.walletAddress);
  if (byWallet) {
    if (!needsPrivyLinkUpdate(byWallet, identity)) return byWallet;
    const linkedByWallet = await supabaseService
      .from("users")
      .update({
        privy_user_id: identity.privyUserId,
        privy_wallet_address: identity.walletAddress,
        auth_provider: "privy",
      } as Database["public"]["Tables"]["users"]["Update"])
      .eq("id", byWallet.id)
      .select(publicColumns)
      .single();
    if (!linkedByWallet.error && linkedByWallet.data) {
      return linkedByWallet.data as DbUserRow;
    }
  }

  if (!identity.email) return null;

  const normalizedConflictEmail = normalizeEmail(identity.email);
  const byEmail = await supabaseService
    .from("users")
    .select(publicColumns)
    .ilike("email", normalizedConflictEmail)
    .maybeSingle();
  if (byEmail.error || !byEmail.data) return null;

  const linked = await supabaseService
    .from("users")
    .update({
      privy_user_id: identity.privyUserId,
      privy_wallet_address: identity.walletAddress,
      auth_provider: "privy",
    } as Database["public"]["Tables"]["users"]["Update"])
    .eq("id", byEmail.data.id)
    .select(publicColumns)
    .single();

  if (linked.error || !linked.data) return null;
  return linked.data as DbUserRow;
};

const upsertPrivyUser = async (
  supabaseService: {
    from: (table: string) => {
      select: (columns: string) => any;
      insert: (values: UserInsert) => any;
      update: (values: Database["public"]["Tables"]["users"]["Update"]) => any;
    };
  },
  identity: { privyUserId: string; walletAddress: string | null; email: string | null }
): Promise<DbUserRow> => {
  const byPrivy = await supabaseService
    .from("users")
    .select(publicColumns)
    .eq("privy_user_id", identity.privyUserId)
    .maybeSingle();
  if (byPrivy.error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: byPrivy.error.message });
  }

  let userRow = byPrivy.data as DbUserRow | null;

  if (!userRow) {
    userRow = await findUserByPrivyWallet(supabaseService, identity.walletAddress);
  }

  if (!userRow && identity.email) {
    const normalizedLookupEmail = normalizeEmail(identity.email);
    const byEmail = await supabaseService
      .from("users")
      .select(publicColumns)
      .ilike("email", normalizedLookupEmail)
      .maybeSingle();
    if (byEmail.error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: byEmail.error.message });
    }
    userRow = (byEmail.data as DbUserRow | null) ?? null;
  }

  if (userRow) {
    if (!needsPrivyLinkUpdate(userRow, identity)) {
      return userRow;
    }
    const updated = await supabaseService
      .from("users")
      .update({
        privy_user_id: identity.privyUserId,
        privy_wallet_address: identity.walletAddress,
        auth_provider: "privy",
      } as Database["public"]["Tables"]["users"]["Update"])
      .eq("id", userRow.id)
      .select(publicColumns)
      .single();

    if (updated.error || !updated.data) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: updated.error?.message ?? "Failed to link Privy identity",
      });
    }
    return updated.data as DbUserRow;
  }

  const email = normalizeEmail(identity.email ?? buildPrivyEmail(identity.privyUserId));
  let insertedUser: DbUserRow | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const usernameBase = buildPrivyUsername(identity.privyUserId);
    const username =
      attempt === 0
        ? usernameBase
        : normalizeUsername(`${usernameBase}_${randomBytes(2).toString("hex")}`);

    const insert = await supabaseService
      .from("users")
      .insert({
        email,
        username,
        display_name: null,
        is_admin: false,
        privy_user_id: identity.privyUserId,
        privy_wallet_address: identity.walletAddress,
        auth_provider: "privy",
      } as UserInsert)
      .select(publicColumns)
      .single();

    if (!insert.error && insert.data) {
      insertedUser = insert.data as DbUserRow;
      break;
    }

    lastError = insert.error?.message ?? "PRIVY_USER_INSERT_FAILED";
    if (!isDuplicateError(insert.error as { code?: unknown; message?: unknown })) {
      break;
    }

    const recovered = await resolvePrivyUserConflict(supabaseService, identity);
    if (recovered) {
      insertedUser = recovered;
      break;
    }
  }

  if (!insertedUser) {
    const recovered = await resolvePrivyUserConflict(supabaseService, identity);
    if (recovered) return recovered;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: lastError ?? "PRIVY_USER_INSERT_FAILED",
    });
  }

  return insertedUser;
};

export const authRouter = router({
  privyLogin: csrfPublicMutation
    .input(privyLoginInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const ip = getTrustedClientIpFromRequest(ctx.req) ?? "unknown";
        const loginRate = await consumeDurableRateLimit(ctx.supabaseService, {
          key: `login:${ip}`,
          limit: 15,
          windowSeconds: 60,
        });
        if (!loginRate.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "LOGIN_RATE_LIMITED" });
        }

        const identity = await verifyPrivyAccessToken(input.accessToken);
        const userRow = await upsertPrivyUser(ctx.supabaseService as any, identity);
        await issueAuthCookie(ctx.setCookie, userRow);
        return { user: toPublicUser(userRow) };
      } catch (error) {
        const err = error as { message?: string; code?: string | number };
        console.warn("[auth.privyLogin] failed", {
          message: String(err?.message ?? "unknown_error"),
          code: err?.code ?? null,
          hasCsrfCookie: Boolean(ctx.cookies?.csrf_token),
          hasAuthCookie: Boolean(ctx.cookies?.auth_token),
          hasServiceRole: Boolean(ctx.hasServiceRole),
        });
        throw error;
      }
    }),

  privyLogout: csrfPublicMutation.mutation(async ({ ctx }) => {
    ctx.setCookie(clearAuthCookie());
    return { success: true };
  }),

  me: publicProcedure.query(async ({ ctx }) => {
    const token = ctx.cookies?.auth_token;
    if (!token) return null;

    try {
      const payload = await verifyAuthToken(token);
      const { data, error } = await ctx.supabaseService
        .from("users")
        .select(publicColumns)
        .eq("id", payload.sub)
        .maybeSingle();
      if (error || !data) return null;
      return toPublicUser(data as DbUserRow);
    } catch {
      return null;
    }
  }),

  // Backward compatible alias for any stale clients still calling auth.logout.
  logout: csrfPublicMutation.mutation(async ({ ctx }) => {
    ctx.setCookie(clearAuthCookie());
    return { success: true };
  }),
});
