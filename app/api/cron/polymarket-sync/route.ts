import { NextResponse } from "next/server";
import { syncPolymarketMirror, type PolymarketSyncScope } from "@/src/server/polymarket/sync";

export const runtime = "nodejs";

const isAuthorized = (request: Request): boolean => {
  const expected = process.env.POLYMARKET_SYNC_SECRET || process.env.CRON_SECRET;
  if (!expected) return true;
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return false;
  const token = auth.slice(7).trim();
  return token.length > 0 && token === expected;
};

const toScope = (raw: string | null): PolymarketSyncScope => {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "all" || value === "open") return value;
  const minute = new Date().getUTCMinutes();
  return minute % 15 === 0 ? "all" : "open";
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "UNKNOWN_ERROR";
  }
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope = toScope(url.searchParams.get("scope"));

  try {
    const result = await syncPolymarketMirror(scope);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(error), scope },
      { status: 500 }
    );
  }
}
