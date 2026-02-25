import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const _ = req;
  return NextResponse.json(
    { ok: false, error: "ONCHAIN_WEBHOOK_DISABLED_IN_POLYMARKET_WRAPPER_MODE" },
    { status: 410 }
  );
}

