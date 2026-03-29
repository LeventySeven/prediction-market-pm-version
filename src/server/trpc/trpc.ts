import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";
import { assertCsrfForMutation } from "../security/csrf";
import { consumeDurableRateLimit } from "../security/rateLimit";
import { getTrustedClientIpFromRequest } from "../http/ip";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/**
 * Authenticated procedure — reusable middleware that guarantees ctx.authUser
 * is present. All mutations that require login should use this instead of
 * publicProcedure + manual `if (!authUser)` checks.
 */
export const authenticatedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.authUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({
    ctx: {
      ...ctx,
      authUser: ctx.authUser,
    },
  });
});

// ---------------------------------------------------------------------------
// CSRF middleware — validates double-submit cookie token on every mutation.
// ---------------------------------------------------------------------------
const csrfMiddleware = t.middleware(async ({ ctx, next }) => {
  try {
    assertCsrfForMutation(ctx.req, ctx.cookies ?? {});
  } catch (error) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: error instanceof Error ? error.message : "CSRF_VALIDATION_FAILED",
    });
  }
  return next({ ctx });
});

/** Public mutation with CSRF validation (login/logout). */
export const csrfPublicMutation = publicProcedure.use(csrfMiddleware);

/** Authenticated mutation with CSRF validation. */
export const csrfAuthenticatedMutation = authenticatedProcedure.use(csrfMiddleware);

// ---------------------------------------------------------------------------
// Rate-limit middleware factory — creates a reusable tRPC middleware with a
// given key prefix, limit, and window.  Key is built as prefix:userId:ip.
// ---------------------------------------------------------------------------
export type RateLimitConfig = {
  prefix: string;
  limit: number;
  windowSeconds: number;
};

export const rateLimitMiddleware = (config: RateLimitConfig) =>
  t.middleware(async ({ ctx, next }) => {
    const ip = getTrustedClientIpFromRequest(ctx.req) ?? "unknown";
    const userId = (ctx as { authUser?: { id: string } }).authUser?.id ?? "anon";
    const rl = await consumeDurableRateLimit(ctx.supabaseService, {
      key: `${config.prefix}:${userId}:${ip}`,
      limit: config.limit,
      windowSeconds: config.windowSeconds,
    });
    if (!rl.allowed) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "RATE_LIMITED" });
    }
    return next({ ctx });
  });

