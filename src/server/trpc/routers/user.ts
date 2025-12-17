import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
type UserRow = {
  id: string;
  telegram_id: number;
  username: string | null;
  display_name: string | null;
  balance: number;
};
type UserInsert = {
  telegram_id: number;
  username: string | null;
  display_name: string;
};
type UserUpdate = Partial<UserInsert>;
type NarrowUserDb = {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: UserInsert;
        Update: UserUpdate;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
type UserDbClient = SupabaseClient<NarrowUserDb, "public">;

type SelectUserResponse = {
  data: UserRow | null;
  error: PostgrestError | null;
};

const selectUserByTelegramId = (
  client: UserDbClient,
  telegramId: number
): Promise<SelectUserResponse> => {
  return (client
    .from("users")
    .select("id, telegram_id, username, display_name, balance")
    .eq("telegram_id", telegramId)
    .maybeSingle<UserRow>()) as unknown as Promise<SelectUserResponse>;
};

const insertTelegramUser = (
  client: UserDbClient,
  payload: UserInsert
): Promise<SelectUserResponse> => {
  return (client
    .from("users")
    .insert([payload] as UserInsert[])
    .select("id, telegram_id, username, display_name, balance")
    .single<UserRow>()) as unknown as Promise<SelectUserResponse>;
};

const userShape = {
  id: z.string(),
  telegramId: z.number(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  balance: z.number(),
};

export const userRouter = router({
  registerUser: publicProcedure
    .input(
      z.object({
        telegramId: z.number(),
        username: z.string().optional(),
        displayName: z.string().optional(),
      })
    )
    .output(z.object(userShape))
    .mutation(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const userClient = supabase as UserDbClient;
      const { telegramId } = input;
      const username = input.username?.trim() || null;
      const displayName =
        input.displayName?.trim() || username || `tg-${telegramId}`;

      const existing = await selectUserByTelegramId(userClient, telegramId);

      if (existing.data) {
        const u = existing.data;
        return {
          id: String(u.id),
          telegramId: Number(u.telegram_id),
          username: u.username,
          displayName: u.display_name,
          balance: Number(u.balance),
        };
      }

      const insert = await insertTelegramUser(userClient, {
        telegram_id: telegramId,
        username,
        display_name: displayName,
      });

      if (insert.error || !insert.data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: insert.error?.message ?? "Failed to create user",
        });
      }

      const u = insert.data;
      return {
        id: String(u.id),
        telegramId: Number(u.telegram_id),
        username: u.username,
        displayName: u.display_name,
        balance: Number(u.balance),
      };
    }),

  getMe: publicProcedure
    .input(z.object({ telegramId: z.number() }))
    .output(z.object(userShape))
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const userClient = supabase as UserDbClient;
      const { telegramId } = input;

      const user = await selectUserByTelegramId(userClient, telegramId);

      if (!user.data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const u = user.data;
      return {
        id: String(u.id),
        telegramId: Number(u.telegram_id),
        username: u.username,
        displayName: u.display_name,
        balance: Number(u.balance),
      };
    }),
});

