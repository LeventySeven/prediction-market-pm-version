import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import type { Json } from "../../../types/database";
import { consumeDurableRateLimit } from "../../security/rateLimit";
import { getTrustedClientIpFromRequest } from "../../http/ip";
import { parseVenueMarketRef, type VenueProvider } from "../../venues/types";

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
  provider: z.enum(["polymarket", "limitless"]).optional(),
  eventType: z.enum(["view", "dwell", "click", "bookmark", "comment", "trade_intent"]),
  value: z.number().finite().optional(),
  metadata: z.record(z.string(), jsonValueSchema).optional(),
});

const trackOutput = z.object({
  apiVersion: z.literal("v1"),
  ok: z.boolean(),
});

const resolveMarketRefId = async (
  supabaseService: unknown,
  provider: VenueProvider,
  providerMarketId: string
): Promise<string | null> => {
  try {
    const { data, error } = await (supabaseService as any)
      .from("market_catalog")
      .select("id")
      .eq("provider", provider)
      .eq("provider_market_id", providerMarketId)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const id = String((data as Record<string, unknown>).id ?? "").trim();
    return id || null;
  } catch {
    return null;
  }
};

export const eventsRouter = router({
  track: publicProcedure
    .input(trackInput)
    .output(trackOutput)
    .mutation(async ({ ctx, input }) => {
      const requestIp = getTrustedClientIpFromRequest(ctx.req) ?? "unknown";
      const rateLimitKey = `events:${ctx.authUser?.id ?? "anon"}:${requestIp}:${input.sessionId}`;
      const limit = await consumeDurableRateLimit(ctx.supabaseService, {
        key: rateLimitKey,
        limit: 90,
        windowSeconds: 60,
      });
      if (!limit.allowed) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "EVENT_RATE_LIMITED" });
      }

      const serialized = JSON.stringify(input.metadata ?? {});
      const safeMetadata =
        serialized.length <= 1024
          ? input.metadata ?? {}
          : ({ truncated: true, reason: "metadata_too_large" } as Record<string, Json>);

      const ref = parseVenueMarketRef(input.marketId, input.provider ?? null);
      const marketRefId = await resolveMarketRefId(
        ctx.supabaseService,
        ref.provider,
        ref.providerMarketId
      );

      const { error } = await (ctx.supabaseService as any).from("user_events").insert({
        user_id: ctx.authUser?.id ?? null,
        session_id: input.sessionId,
        market_id: input.marketId,
        market_ref_id: marketRefId,
        event_type: input.eventType,
        event_value: input.value ?? null,
        metadata: {
          ...safeMetadata,
          provider: ref.provider,
          providerMarketId: ref.providerMarketId,
          canonicalMarketId: ref.canonicalMarketId,
        },
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
