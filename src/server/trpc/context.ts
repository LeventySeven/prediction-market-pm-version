import { supabaseServerClient } from "../supabase/client";
import type { inferAsyncReturnType } from "@trpc/server";

function parseCookies(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    })
  );
}

export const createContext = (opts: { req: Request }) => {
  const supabase = supabaseServerClient();
  const headers = new Headers();
  const cookies = parseCookies(opts.req);

  return {
    supabase,
    req: opts.req,
    headers,
    cookies,
    setCookie: (value: string) => headers.append("set-cookie", value),
  };
};

export type Context = inferAsyncReturnType<typeof createContext>;

