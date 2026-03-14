import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

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

