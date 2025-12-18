import { supabaseServerClient } from "../supabase/client";
import { verifyAuthToken } from "../auth/jwt";
import type { inferAsyncReturnType } from "@trpc/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";

function parseCookies(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    })
  );
}

export const createContext = async (opts: { req: Request }) => {
  const supabase: SupabaseClient<Database, "public"> = supabaseServerClient();
  const responseHeaders: Record<string, string | string[]> = {};
  const cookies = parseCookies(opts.req);
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
    } catch {
      authUser = null;
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
    req: opts.req,
    cookies,
    responseHeaders,
    setCookie: (value: string) => appendHeader("set-cookie", value),
    authUser,
  };
};

export type Context = inferAsyncReturnType<typeof createContext>;

