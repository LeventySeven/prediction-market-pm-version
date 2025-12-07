import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/src/server/trpc/router";
import { createContext } from "@/src/server/trpc/context";

// Ensure this route is always dynamic and runs on Node (Supabase service key not allowed on edge).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext({ req }),
    responseMeta({ ctx }) {
      if (ctx?.headers) {
        return {
          headers: ctx.headers,
        };
      }
      return {};
    },
  });

export { handler as GET, handler as POST };

