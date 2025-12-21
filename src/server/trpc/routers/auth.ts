import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashPassword, verifyPassword } from "../../auth/password";
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
const authColumns = `${publicColumns}, password_hash`;

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

      const existing = await supabase
        .from("users")
        .select("id")
        .or(`email.eq.${email},username.eq.${username}`)
        .maybeSingle();

      if (existing.data) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User with this email or username already exists",
        });
      }

      const password_hash = await hashPassword(input.password);

      const payload: UserInsert = {
        email,
        username,
        display_name: username,
        is_admin: false,
        password_hash,
      };

      const inserted = await (supabase as unknown as SupabaseClient<any>)
        .from(USERS_TABLE)
        .insert(payload)
        .select(publicColumns)
        .single();

      if (inserted.error || !inserted.data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: inserted.error?.message ?? "Failed to create user",
        });
      }

      // Initialize wallet balance for new user
      await (supabase as unknown as SupabaseClient<any>)
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

      const { data, error } = await supabase
        .from("users")
        .select(authColumns)
        .or(
          `email.eq.${emailOrUsername.toLowerCase()},username.eq.${emailOrUsername}`
        )
        .maybeSingle();

      if (error || !data) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const authRow = data as DbUserRow;
      const valid = await verifyPassword(input.password, authRow.password_hash);
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

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
