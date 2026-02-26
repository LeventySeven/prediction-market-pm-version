import { userRouter } from "./routers/user";
import { marketRouter } from "./routers/market";
import { authRouter } from "./routers/auth";
import { router } from "./trpc";

export const appRouter = router({
  user: userRouter,
  market: marketRouter,
  auth: authRouter,
});

export const createCaller = appRouter.createCaller;
export type AppRouter = typeof appRouter;

