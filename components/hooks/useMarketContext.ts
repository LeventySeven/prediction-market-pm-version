'use client';

import { useCallback, useState } from "react";
import { trpcClient } from "@/src/utils/trpcClient";
import type { ErrorLike } from "@/src/lib/errors";
import { getErrorMessage } from "@/src/lib/errors";

type MarketContextPayload = { context: string; sources: string[]; updatedAt: string };

export function useMarketContext() {
  const [marketContextById, setMarketContextById] = useState<Record<string, MarketContextPayload>>({});
  const [marketContextLoadingId, setMarketContextLoadingId] = useState<string | null>(null);
  const [marketContextErrorById, setMarketContextErrorById] = useState<Record<string, string | null>>({});

  const handleFetchMarketContext = useCallback(async (marketId: string) => {
    if (!marketId || marketContextLoadingId === marketId) return;
    setMarketContextErrorById((prev) => ({ ...prev, [marketId]: null }));
    setMarketContextLoadingId(marketId);
    try {
      const result = await trpcClient.market.generateMarketContext.mutate({ marketId });
      setMarketContextById((prev) => ({
        ...prev,
        [marketId]: {
          context: result.context,
          sources: result.sources,
          updatedAt: result.updatedAt,
        },
      }));
    } catch (err) {
      console.error("generateMarketContext failed", err);
      setMarketContextErrorById((prev) => ({ ...prev, [marketId]: getErrorMessage(err as ErrorLike) ?? "Unknown error" }));
    } finally {
      setMarketContextLoadingId((prev) => (prev === marketId ? null : prev));
    }
  }, [marketContextLoadingId]);

  return {
    marketContextById,
    marketContextLoadingId,
    marketContextErrorById,
    handleFetchMarketContext,
  };
}
