import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import type { Session } from "@supabase/supabase-js";
import { authCookie, signAuthToken, verifyAuthToken } from "../../auth/jwt";
import type { PublicUser } from "../../auth/types";
import type { Database } from "../../../types/database";
import { toMajorUnits } from "../helpers/pricing";

const SUPABASE_ACCESS_COOKIE = "sb_access_token";
const SUPABASE_REFRESH_COOKIE = "sb_refresh_token";
const SUPABASE_REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const secureCookie = process.env.NODE_ENV === "production" ? " Secure;" : "";

const buildCookie = (name: string, value: string, maxAgeSeconds: number) =>
  `${name}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds};${secureCookie}`;

const clearCookie = (name: string) => buildCookie(name, "", 0);

const supabaseAccessCookie = (token: string, expiresIn?: number | null) =>
  buildCookie(SUPABASE_ACCESS_COOKIE, token, Math.max(1, expiresIn ?? 3600));

const supabaseRefreshCookie = (token: string) =>
  buildCookie(SUPABASE_REFRESH_COOKIE, token, SUPABASE_REFRESH_MAX_AGE);

const persistSupabaseSession = (session: Session, setCookie: (value: string) => void) => {
  if (session?.access_token) {
    setCookie(supabaseAccessCookie(session.access_token, session.expires_in));
  }
  if (session?.refresh_token) {
    setCookie(supabaseRefreshCookie(session.refresh_token));
  }
};

const DEFAULT_ASSET = "VCOIN";
const VCOIN_DECIMALS = 6;

const emailSchema = z.string().email().max(255);
const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Username may contain letters, numbers, _, ., -");
const passwordSchema = z.string().min(8).max(128);

const publicColumns =
  "id, email, username, display_name, referral_code, referral_commission_rate, referral_enabled, created_at, is_admin";

const USERS_TABLE = "users" as const;
const WALLET_BALANCES_TABLE = "wallet_balances" as const;

type DbUserRow = Database["public"]["Tables"]["users"]["Row"];

type UserInsert = Database["public"]["Tables"]["users"]["Insert"];
type WalletBalanceInsert = Database["public"]["Tables"]["wallet_balances"]["Insert"];
type WalletBalanceRow = Pick<Database["public"]["Tables"]["wallet_balances"]["Row"], "balance_minor">;

const toPublicUser = (row: DbUserRow, balanceMinor: number = 0): PublicUser => ({
  id: String(row.id),
  email: row.email,
  username: row.username,
  displayName: row.display_name,
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

export const authRouter = router({
  signUp: publicProcedure
    .input(
      z.object({
        email: emailSchema,
        username: usernameSchema,
        password: passwordSchema,
        displayName: z.string().trim().min(2).max(32).optional(),
        referralCode: z.string().trim().min(1).max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, supabaseService, setCookie } = ctx;
      const email = input.email.toLowerCase().trim();
      const username = input.username.trim();
      const displayName = input.displayName?.trim() || username;
      const referralCode = input.referralCode?.trim() || null;

      const existing = await supabaseService
        .from("users")
        .select("id")
        .or(`email.eq.${email},username.eq.${username}`)
        .maybeSingle();

      if (existing.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: existing.error.message,
        });
      }

      if (existing.data) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User with this email or username already exists",
        });
      }

      const createdUser = await supabaseService.auth.admin.createUser({
        email,
        password: input.password,
        email_confirm: true,
        user_metadata: { username },
      });

      if (createdUser.error || !createdUser.data?.user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: createdUser.error?.message ?? "Failed to register user",
        });
      }

      const userId = createdUser.data.user.id;

      const payload: UserInsert = {
        id: userId,
        email,
        username,
        display_name: displayName,
        is_admin: false,
        referral_code: null,
      };

      const inserted = await supabaseService
        .from("users")
        .upsert(payload, { onConflict: "id" })
        .select(publicColumns)
        .single();

      if (inserted.error || !inserted.data) {
        await supabase.auth.admin.deleteUser(userId);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: inserted.error?.message ?? "Failed to create user",
        });
      }

      // Initialize wallet balance for new user
      await supabaseService
        .from("wallet_balances")
        .insert({
          user_id: inserted.data.id,
          asset_code: DEFAULT_ASSET,
          balance_minor: 0,
        } as WalletBalanceInsert)
        .select()
        .maybeSingle();

      // Attach referral (optional). We don't block signup if the code is invalid.
      if (referralCode) {
        const { data: referrerRow } = await supabaseService
          .from("users")
          .select("id, referral_enabled")
          .eq("referral_code", referralCode)
          .maybeSingle();

        // Only accept codes that are explicitly enabled.
        if (referrerRow?.id && referrerRow.id !== userId && referrerRow.referral_enabled === true) {
          await supabaseService
            .from("user_referrals")
            .upsert(
              {
                user_id: userId,
                referrer_user_id: referrerRow.id,
              },
              { onConflict: "user_id" }
            );
        }
      }

      const autoLogin = await supabase.auth.signInWithPassword({
        email,
        password: input.password,
      });

      if (autoLogin.error || !autoLogin.data?.session) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: autoLogin.error?.message ?? "Failed to start session",
        });
      }

      persistSupabaseSession(autoLogin.data.session, setCookie);

      const token = await signAuthToken({
        sub: String(inserted.data.id),
        email: inserted.data.email,
        username: inserted.data.username,
        isAdmin: Boolean(inserted.data.is_admin),
      });
      setCookie(authCookie(token));

      return { user: toPublicUser(inserted.data as DbUserRow, 0) };
    }),

  login: publicProcedure
    .input(
      z.object({
        emailOrUsername: z.string().min(1),
        password: passwordSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, supabaseService, setCookie } = ctx;
      const emailOrUsername = input.emailOrUsername.trim();

      let loginEmail = emailOrUsername.toLowerCase();
      if (!emailOrUsername.includes("@")) {
        const { data: usernameRow, error: usernameError } = await supabaseService
          .from("users")
          .select("email")
          .eq("username", emailOrUsername)
          .maybeSingle();

        if (usernameError || !usernameRow) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid credentials",
          });
        }
        loginEmail = usernameRow.email.toLowerCase();
      }

      const signIn = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: input.password,
      });

      if (signIn.error || !signIn.data?.user || !signIn.data.session) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const authUser = signIn.data.user;

      const { data: userRow, error } = await supabaseService
        .from("users")
        .select(publicColumns)
        .eq("id", authUser.id)
        .maybeSingle();

      if (error || !userRow) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const authRow = userRow as DbUserRow;

      // Fetch wallet balance
      const { data: walletRow } = await supabaseService
        .from("wallet_balances")
        .select("balance_minor")
        .eq("user_id", authRow.id)
        .eq("asset_code", DEFAULT_ASSET)
        .maybeSingle();

      const wallet = walletRow as WalletBalanceRow | null;
      const balanceMinor = wallet ? Number(wallet.balance_minor ?? 0) : 0;

      persistSupabaseSession(signIn.data.session, setCookie);

      const token = await signAuthToken({
        sub: String(authRow.id),
        email: authRow.email,
        username: authRow.username,
        isAdmin: Boolean(authRow.is_admin),
      });
      setCookie(authCookie(token));

      return { user: toPublicUser(authRow, Number(balanceMinor)) };
    }),

  me: publicProcedure.query(async ({ ctx }) => {
    const { supabase, cookies } = ctx;
    const token = cookies?.auth_token;
    if (!token) return null;

    try {
      const payload = await verifyAuthToken(token);
      const { data, error } = await supabase
        .from("users")
        .select(publicColumns)
        .eq("id", payload.sub)
        .maybeSingle();
      if (error || !data) return null;
      const currentUser = data as DbUserRow;

      // Fetch wallet balance
      const { data: walletRow } = await supabase
        .from("wallet_balances")
        .select("balance_minor")
        .eq("user_id", currentUser.id)
        .eq("asset_code", DEFAULT_ASSET)
        .maybeSingle();

      const wallet = walletRow as WalletBalanceRow | null;
      const balanceMinor = wallet ? Number(wallet.balance_minor ?? 0) : 0;

      return toPublicUser(currentUser, Number(balanceMinor));
    } catch {
      return null;
    }
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    ctx.setCookie("auth_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    ctx.setCookie(clearCookie(SUPABASE_ACCESS_COOKIE));
    ctx.setCookie(clearCookie(SUPABASE_REFRESH_COOKIE));
    return { success: true };
  }),
});
