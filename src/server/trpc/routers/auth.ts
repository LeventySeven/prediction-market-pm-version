import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { hashPassword, verifyPassword } from "../../auth/password";
import { authCookie, signAuthToken, verifyAuthToken } from "../../auth/jwt";
import type { PublicUser } from "../../auth/types";

const emailSchema = z.string().email().max(255);
const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Username may contain letters, numbers, _, ., -");
const passwordSchema = z.string().min(8).max(128);

const publicColumns =
  "id, email, username, display_name, balance, created_at, is_admin";
const authColumns = `${publicColumns}, password_hash`;

const toPublicUser = (row: any): PublicUser => ({
  id: Number(row.id),
  email: row.email,
  username: row.username,
  displayName: row.display_name,
  balance: Number(row.balance),
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

      const inserted = await supabase
        .from("users")
        .insert({
          email,
          username,
          display_name: username,
          is_admin: false,
          password_hash,
        })
        .select(publicColumns)
        .single();

      if (inserted.error || !inserted.data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: inserted.error?.message ?? "Failed to create user",
        });
      }

      const token = await signAuthToken({
        sub: String(inserted.data.id),
        email: inserted.data.email,
        username: inserted.data.username,
        isAdmin: Boolean(inserted.data.is_admin),
      });
      setCookie(authCookie(token));

      return { user: toPublicUser(inserted.data) };
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

      const valid = await verifyPassword(input.password, data.password_hash);
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const token = await signAuthToken({
        sub: String(data.id),
        email: data.email,
        username: data.username,
        isAdmin: Boolean(data.is_admin),
      });
      setCookie(authCookie(token));

      return { user: toPublicUser(data) };
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
        .eq("id", Number(payload.sub))
        .maybeSingle();
      if (error || !data) return null;
      return toPublicUser(data);
    } catch {
      return null;
    }
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    ctx.setCookie("auth_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    return { success: true };
  }),
});

