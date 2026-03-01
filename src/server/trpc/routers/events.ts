import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import type { Json } from "../../../types/database";

const jsonValueSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

const trackInput = z.object({
  sessionId: z.string().min(8).max(128),
  marketId: z.string().min(1).max(256),
  eventType: z.enum(["view", "dwell", "click", "bookmark", "comment", "trade_intent"]),
  value: z.number().finite().optional(),
  metadata: z.record(z.string(), jsonValueSchema).optional(),
});

const trackOutput = z.object({
  apiVersion: z.literal("v1"),
  ok: z.boolean(),
});

const eventRateLimit = new Map<string, { count: number; resetAt: number }>();

const applyRateLimit = (key: string) => {
  const now = Date.now();
  const windowMs = 60_000;
  const maxPerWindow = 90;
  const current = eventRateLimit.get(key);
  if (!current || current.resetAt <= now) {
    eventRateLimit.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= maxPerWindow) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "EVENT_RATE_LIMITED" });
  }
  current.count += 1;
};

export const eventsRouter = router({
  track: publicProcedure
    .input(trackInput)
    .output(trackOutput)
    .mutation(async ({ ctx, input }) => {
      const key = `${ctx.authUser?.id ?? "anon"}:${input.sessionId}`;
      applyRateLimit(key);

      const serialized = JSON.stringify(input.metadata ?? {});
      const safeMetadata =
        serialized.length <= 1024
          ? input.metadata ?? {}
          : ({ truncated: true, reason: "metadata_too_large" } as Record<string, Json>);

      const { error } = await ctx.supabaseService.from("user_events").insert({
        user_id: ctx.authUser?.id ?? null,
        session_id: input.sessionId,
        market_id: input.marketId,
        event_type: input.eventType,
        event_value: input.value ?? null,
        metadata: safeMetadata,
      });

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return {
        apiVersion: "v1",
        ok: true,
      };
    }),
});
