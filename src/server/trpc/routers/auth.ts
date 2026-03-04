import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { publicProcedure, router } from "../trpc";
import { authCookie, clearAuthCookie, signAuthToken, verifyAuthToken } from "../../auth/jwt";
import type { PublicUser } from "../../auth/types";
import type { Database } from "../../../types/database";
import { verifyPrivyAccessToken } from "../../auth/privy";
import { assertCsrfForMutation } from "../../security/csrf";
import { sanitizeAvatarPalette } from "@/src/lib/avatarPalette";

const publicColumns =
  "id, email, username, display_name, avatar_url, profile_description, avatar_palette, profile_setup_completed_at, telegram_photo_url, referral_code, referral_commission_rate, referral_enabled, created_at, is_admin, privy_user_id, privy_wallet_address, auth_provider";

type DbUserRow = Database["public"]["Tables"]["users"]["Row"];
type UserInsert = Database["public"]["Tables"]["users"]["Insert"];

const PRIVY_PLACEHOLDER_DOMAIN = "privy.local";
const buildPrivyEmail = (privyUserId: string) => `privy_${privyUserId}@${PRIVY_PLACEHOLDER_DOMAIN}`;

const normalizeUsername = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "")
    .slice(0, 32);

const buildPrivyUsername = (privyUserId: string) =>
  normalizeUsername(`privy_${privyUserId}`) || `privy_${randomBytes(4).toString("hex")}`;

const toPublicUser = (row: DbUserRow): PublicUser => ({
  id: String(row.id),
  email: row.email,
  username: row.username,
  displayName: row.display_name,
  avatarUrl: row.avatar_url ?? null,
  profileDescription: row.profile_description ?? null,
  avatarPalette: sanitizeAvatarPalette(row.avatar_palette),
  needsProfileSetup: row.auth_provider === "privy" && !row.profile_setup_completed_at,
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

  if (!userRow && identity.email) {
    const byEmail = await supabaseService
      .from("users")
      .select(publicColumns)
      .eq("email", identity.email)
      .maybeSingle();
    if (byEmail.error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: byEmail.error.message });
    }
    userRow = (byEmail.data as DbUserRow | null) ?? null;
  }

  if (userRow) {
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

  const email = identity.email ?? buildPrivyEmail(identity.privyUserId);
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
    if (!String(lastError).toLowerCase().includes("duplicate")) {
      break;
    }
  }

  if (!insertedUser) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: lastError ?? "PRIVY_USER_INSERT_FAILED",
    });
  }

  return insertedUser;
};

export const authRouter = router({
  privyLogin: publicProcedure
    .input(z.object({ accessToken: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        assertCsrfForMutation(ctx.req, ctx.cookies ?? {});
      } catch (error) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: error instanceof Error ? error.message : "CSRF_VALIDATION_FAILED",
        });
      }
      const identity = await verifyPrivyAccessToken(input.accessToken);
      const userRow = await upsertPrivyUser(ctx.supabaseService as any, identity);
      await issueAuthCookie(ctx.setCookie, userRow);
      return { user: toPublicUser(userRow) };
    }),

  privyLogout: publicProcedure.mutation(async ({ ctx }) => {
    try {
      assertCsrfForMutation(ctx.req, ctx.cookies ?? {});
    } catch (error) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: error instanceof Error ? error.message : "CSRF_VALIDATION_FAILED",
      });
    }
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
  logout: publicProcedure.mutation(async ({ ctx }) => {
    try {
      assertCsrfForMutation(ctx.req, ctx.cookies ?? {});
    } catch (error) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: error instanceof Error ? error.message : "CSRF_VALIDATION_FAILED",
      });
    }
    ctx.setCookie(clearAuthCookie());
    return { success: true };
  }),
});
