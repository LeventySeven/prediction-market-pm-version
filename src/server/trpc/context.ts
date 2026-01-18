import { createSupabaseUserClient, getSupabaseServiceClient } from "../supabase/client";
import { verifyAuthToken } from "../auth/jwt";
import { parseCookies } from "../http/cookies";
import type { inferAsyncReturnType } from "@trpc/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";

export const createContext = async (opts: { req: Request }) => {
  const responseHeaders: Record<string, string | string[]> = {};
  const cookies = parseCookies(opts.req);
  const supabaseAccessToken = cookies["sb_access_token"];
  const supabase: SupabaseClient<Database, "public"> = createSupabaseUserClient(supabaseAccessToken);
  // IMPORTANT:
  // Some environments (preview/dev) may not have SUPABASE_SERVICE_ROLE_KEY configured.
  // If we throw here, *every* tRPC request (including public reads like markets/leaderboard)
  // fails and the frontend appears "dead".
  //
  // We fall back to the user client in that case. Procedures that truly require service-role
  // privileges will still fail with a clear DB/RLS error, but the app stays usable for public pages.
  let supabaseService: SupabaseClient<Database, "public"> = supabase;
  try {
    supabaseService = getSupabaseServiceClient();
  } catch (err) {
    console.warn("Supabase service client unavailable; falling back to anon/user client.", err);
  }
  let authUser: { id: string; email: string; username: string; isAdmin: boolean } | null = null;

  const token = cookies["auth_token"];
  if (token) {
    try {
      const payload = await verifyAuthToken(token);
      authUser = {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
        isAdmin: Boolean(payload.isAdmin),
      };
    } catch (err) {
      // Log JWT verification failures for debugging
      const cookieHeader = opts.req.headers.get("cookie") || "";
      const hasCookieHeader = cookieHeader.length > 0;
      console.warn("[createContext] JWT verification failed", { 
        hasCookieHeader, 
        cookieHeaderLength: cookieHeader.length,
        cookieKeys: Object.keys(cookies),
        hasAuthToken: Boolean(token),
        error: err instanceof Error ? err.message : String(err)
      });
      authUser = null;
    }
  } else {
    // Log when auth_token cookie is missing
    const method = opts.req.method;
    const url = new URL(opts.req.url);
    const isMutation = method === "POST" && url.pathname.includes("/api/trpc");
    if (isMutation) {
      const cookieHeader = opts.req.headers.get("cookie") || "";
      console.warn("[createContext] auth_token cookie missing for mutation", {
        method,
        pathname: url.pathname,
        hasCookieHeader: cookieHeader.length > 0,
        cookieKeys: Object.keys(cookies),
      });
    }
  }

  const appendHeader = (key: string, value: string) => {
    const existing = responseHeaders[key];
    if (!existing) {
      responseHeaders[key] = value;
    } else if (Array.isArray(existing)) {
      responseHeaders[key] = [...existing, value];
    } else {
      responseHeaders[key] = [existing, value];
    }
  };

  return {
    supabase,
    supabaseService,
    req: opts.req,
    cookies,
    responseHeaders,
    setCookie: (value: string) => appendHeader("set-cookie", value),
    authUser,
  };
};

export type Context = inferAsyncReturnType<typeof createContext>;

