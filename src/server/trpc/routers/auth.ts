import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authCookie, signAuthToken, verifyAuthToken } from "../../auth/jwt";
import type { PublicUser } from "../../auth/types";
import type { Database } from "../../../types/database";
import { toMajorUnits } from "../helpers/pricing";

const DEFAULT_ASSET = "VCOIN";
const VCOIN_DECIMALS = 6;

const emailSchema = z.string().email().max(255);
const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Username may contain letters, numbers, _, ., -");
const passwordSchema = z.string().min(8).max(128);

const publicColumns = "id, email, username, display_name, created_at, is_admin";

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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, setCookie } = ctx;
      const email = input.email.toLowerCase().trim();
      const username = input.username.trim();

      const supabaseAny = supabase as unknown as SupabaseClient<any>;

      const existing = await supabaseAny
        .from(USERS_TABLE)
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

      const createdUser = await supabase.auth.admin.createUser({
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
        display_name: username,
        is_admin: false,
        referral_code: null,
      };

      const inserted = await supabaseAny
        .from(USERS_TABLE)
        .insert(payload)
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
      await supabaseAny
        .from(WALLET_BALANCES_TABLE)
        .insert({
          user_id: inserted.data.id,
          asset_code: DEFAULT_ASSET,
          balance_minor: 0,
        } as WalletBalanceInsert)
        .select()
        .maybeSingle();

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
      const { supabase, setCookie } = ctx;
      const emailOrUsername = input.emailOrUsername.trim();
      const supabaseAny = supabase as unknown as SupabaseClient<any>;

      let loginEmail = emailOrUsername.toLowerCase();
      if (!emailOrUsername.includes("@")) {
        const { data: usernameRow, error: usernameError } = await supabaseAny
          .from(USERS_TABLE)
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

      if (signIn.error || !signIn.data?.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const authUser = signIn.data.user;

      const { data: userRow, error } = await supabaseAny
        .from(USERS_TABLE)
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
      const { data: walletRow } = await supabase
        .from("wallet_balances")
        .select("balance_minor")
        .eq("user_id", authRow.id)
        .eq("asset_code", DEFAULT_ASSET)
        .maybeSingle();

      const wallet = walletRow as WalletBalanceRow | null;
      const balanceMinor = wallet ? Number(wallet.balance_minor ?? 0) : 0;

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
    return { success: true };
  }),
});
