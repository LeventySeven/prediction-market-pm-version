import { NextResponse } from "next/server";
import { getRealtimeMetricsSnapshot } from "@/src/server/observability/realtimeMetrics";
import { collectRealtimeHealthSnapshot } from "@/src/server/ops/realtimeHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const metrics = getRealtimeMetricsSnapshot();
  try {
    const realtime = await collectRealtimeHealthSnapshot();
    return NextResponse.json({
      status: realtime.pipeline.status === "healthy" ? "ok" : "degraded",
      metrics,
      pipeline: realtime.pipeline,
      providers: realtime.supabase.providerSyncState.rows,
      freshness: {
        liveHeads: realtime.supabase.liveHeads,
        candleHeads: realtime.supabase.candleHeads,
      },
      coverage: realtime.supabase.coverage,
      catalog: realtime.supabase.coverage.catalog,
      upstash: realtime.upstash,
      checkedAt: realtime.checkedAt,
    });
  } catch (error) {
    return NextResponse.json({
      status: "degraded",
      metrics,
      pipeline: {
        status: "degraded",
        degraded: true,
        reasons: ["HEALTH_CHECK_FAILED"],
        mode: "unknown",
        upstashFallbackActive: true,
      },
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
