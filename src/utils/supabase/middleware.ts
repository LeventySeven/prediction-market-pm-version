import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { buildCsrfCookieValue, getCsrfCookieName } from "@/src/server/security/csrf";
import { verifyAuthToken, signAuthToken, authCookie, shouldRefreshToken } from "@/src/server/auth/jwt";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export async function updateSession(request: NextRequest) {
  const csrfCookieName = getCsrfCookieName();
  const ensureCsrfCookie = (response: NextResponse) => {
    const existing = request.cookies.get(csrfCookieName)?.value;
    if (existing && existing.length > 0) return response;

    const isProd = process.env.NODE_ENV === "production";
    response.cookies.set(csrfCookieName, buildCsrfCookieValue(), {
      httpOnly: false,
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
    return ensureCsrfCookie(response);
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  try {
    // Required call for SSR auth flow. Supabase refreshes/rotates cookies as needed.
    await supabase.auth.getUser();
  } catch (err) {
    console.warn("Supabase middleware session update failed", err);
  }

  // Sliding session renewal: if the auth JWT is close to expiry, reissue it silently.
  try {
    const authToken = request.cookies.get("auth_token")?.value;
    if (authToken) {
      const payload = await verifyAuthToken(authToken);
      if (shouldRefreshToken(payload)) {
        const freshToken = await signAuthToken({
          sub: payload.sub,
          email: payload.email,
          username: payload.username,
          isAdmin: payload.isAdmin,
        });
        const cookie = authCookie(freshToken);
        response.headers.append("set-cookie", cookie);
      }
    }
  } catch {
    // Token invalid or expired — let the tRPC context handle auth failure.
  }

  return ensureCsrfCookie(response);
}
