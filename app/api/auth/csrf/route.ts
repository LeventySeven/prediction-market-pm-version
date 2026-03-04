import { NextResponse } from "next/server";
import { buildCsrfCookieValue, csrfCookie } from "@/src/server/security/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const issue = () => {
  const response = NextResponse.json({ ok: true });
  response.headers.append("set-cookie", csrfCookie(buildCsrfCookieValue()));
  return response;
};

export const GET = issue;
export const POST = issue;
