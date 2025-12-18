import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import type { Database } from "../../../types/database";

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type UserInsert = Database["public"]["Tables"]["users"]["Insert"];

const userShape = {
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  displayName: z.string().nullable(),
  balance: z.number(),
  createdAt: z.string(),
  isAdmin: z.boolean(),
};

const selectColumns =
  "id, email, username, display_name, balance, created_at, is_admin";

const formatUser = (row: UserRow) => ({
  id: String(row.id),
  email: row.email,
  username: row.username,
  displayName: row.display_name,
  balance: Number(row.balance),
  createdAt: new Date(row.created_at).toISOString(),
  isAdmin: Boolean(row.is_admin),
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

      if (existing.data) {
        return formatUser(existing.data as UserRow);
      }

      const payload: UserInsert = {
        email,
        username,
        display_name: displayName,
        balance: 0,
        password_hash: null,
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

      return formatUser(insert.data as UserRow);
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

      const user = await supabase
        .from("users")
        .select(selectColumns)
        .eq("id", input.userId)
        .maybeSingle();

      if (user.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: user.error.message,
        });
      }

      if (!user.data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return formatUser(user.data as UserRow);
    }),
});

