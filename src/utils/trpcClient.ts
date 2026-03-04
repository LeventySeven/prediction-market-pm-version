import { createTRPCProxyClient, httpBatchLink, httpLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/src/server/trpc/router";
import { getCsrfCookieName, getCsrfHeaderName } from "@/src/server/security/csrf";

const getBaseUrl = () => {
  // IMPORTANT:
  // tRPC's `httpBatchLink` requires an absolute http(s) URL when evaluated in a non-browser
  // environment (e.g. Next.js prerender / edge runtime). A relative URL like `/api/trpc`
  // will crash the build with: "Endpoint URL must start with `http:` or `https:`."
  if (typeof window !== "undefined") {
    const origin = window.location?.origin;
    if (origin && (origin.startsWith("http://") || origin.startsWith("https://"))) return origin;
  }

  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? process.env.VERCEL_URL : undefined);

  if (raw && raw.trim().length > 0) {
    const trimmed = raw.trim();
    return trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
  }

  return "http://localhost:3000";
};

export const trpcClient = createTRPCProxyClient<AppRouter>({
  transformer: superjson,
  links: (() => {
    const disableBatch = process.env.NEXT_PUBLIC_DISABLE_TRPC_BATCH === "true";
    const endpoint = `${getBaseUrl()}/api/trpc`;
    const withCredentialsFetch = (url: string | URL, options: RequestInit = {}) => {
      const headers: HeadersInit = {
        ...options.headers,
      };

      if (typeof window !== "undefined") {
        const cookieName = getCsrfCookieName();
        const csrfValue = document.cookie
          .split(";")
          .map((entry) => entry.trim())
          .find((entry) => entry.startsWith(`${cookieName}=`))
          ?.split("=")
          .slice(1)
          .join("=")
          .trim();

        if (csrfValue) {
          (headers as Record<string, string>)[getCsrfHeaderName()] = csrfValue;
        }
      }

      return fetch(url, {
        ...options,
        credentials: "include",
        headers,
      });
    };

    return disableBatch
      ? [
          httpLink({
            url: endpoint,
            fetch: withCredentialsFetch,
          }),
        ]
      : [
          httpBatchLink({
            url: endpoint,
            // Ensure auth cookies are always sent (important for WebViews / cross-origin edge cases).
            fetch: withCredentialsFetch,
          }),
        ];
  })(),
});
