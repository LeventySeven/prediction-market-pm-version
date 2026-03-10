import "server-only";
import { userRouter } from "./routers/user";
import { marketRouter } from "./routers/market";
import { authRouter } from "./routers/auth";
import { feedRouter } from "./routers/feed";
import { eventsRouter } from "./routers/events";
import { router } from "./trpc";

export const appRouter = router({
  user: userRouter,
  market: marketRouter,
  auth: authRouter,
  feed: feedRouter,
  events: eventsRouter,
});

export const createCaller = appRouter.createCaller;
export type AppRouter = typeof appRouter;
