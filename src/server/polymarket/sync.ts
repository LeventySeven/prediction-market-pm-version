import { getSupabaseServiceClient } from "../supabase/client";
import { listPolymarketMarketsSnapshot } from "./client";
import { upsertMirroredPolymarketMarkets } from "./mirror";

export type PolymarketSyncScope = "open" | "all";

type SyncResult = {
  scope: PolymarketSyncScope;
  fetched: number;
  upserted: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
};

const OPEN_SCOPE_MAX_PAGES = 8;
const ALL_SCOPE_MAX_PAGES = 40;
const PAGE_SIZE = 200;

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "UNKNOWN_ERROR";
  }
};

const writeSyncState = async (
  supabaseService: unknown,
  payload: {
    scope: PolymarketSyncScope;
    startedAt?: string;
    successAt?: string;
    errorMessage?: string | null;
  }
) => {
  if (!supabaseService) return;
  await (supabaseService as any).from("polymarket_sync_state").upsert(
    {
      scope: payload.scope,
      last_started_at: payload.startedAt ?? null,
      last_success_at: payload.successAt ?? null,
      last_error: payload.errorMessage ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "scope" }
  );
};

export async function syncPolymarketMirror(scope: PolymarketSyncScope = "open"): Promise<SyncResult> {
  const supabaseService = getSupabaseServiceClient();
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();
  await writeSyncState(supabaseService, { scope, startedAt, errorMessage: null });

  try {
    const markets = await listPolymarketMarketsSnapshot({
      scope,
      pageSize: PAGE_SIZE,
      maxPages: scope === "open" ? OPEN_SCOPE_MAX_PAGES : ALL_SCOPE_MAX_PAGES,
    });
    const upserted = await upsertMirroredPolymarketMarkets(supabaseService, markets);
    const finishedAtDate = new Date();
    const finishedAt = finishedAtDate.toISOString();
    await writeSyncState(supabaseService, {
      scope,
      startedAt,
      successAt: finishedAt,
      errorMessage: null,
    });

    return {
      scope,
      fetched: markets.length,
      upserted,
      startedAt,
      finishedAt,
      durationMs: finishedAtDate.getTime() - startedAtDate.getTime(),
    };
  } catch (error) {
    const message = toErrorMessage(error);
    await writeSyncState(supabaseService, {
      scope,
      startedAt,
      errorMessage: message,
    });
    throw new Error(message);
  }
}
