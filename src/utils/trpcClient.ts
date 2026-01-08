import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/src/server/trpc/router";

const getBaseUrl = () => {
  if (typeof window !== "undefined") return "";
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
};

export const trpcClient = createTRPCProxyClient<AppRouter>({
  transformer: superjson,
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      // Ensure auth cookies are always sent (important for WebViews / cross-origin edge cases).
      fetch(url, options = {}) {
        return fetch(url, {
          ...options,
          credentials: "include",
          headers: {
            ...options.headers,
          },
        });
      },
    }),
  ],
});

