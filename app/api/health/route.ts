import { NextResponse } from "next/server";
import { getRealtimeMetricsSnapshot } from "@/src/server/observability/realtimeMetrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    metrics: getRealtimeMetricsSnapshot(),
  });
}
