'use client';

import { useCallback, useMemo, useState } from "react";
import type { Market, User } from "@/types";
import { trpcClient } from "@/src/utils/trpcClient";

export type MarketBookmark = { marketId: string; createdAt: string };

export function useBookmarks(params: {
  user: User | null;
  mergedMarkets: Market[];
  sessionIdRef: React.RefObject<string>;
  openAuth: (mode?: "SIGN_IN" | "SIGN_UP") => void;
}) {
  const { user, mergedMarkets, sessionIdRef, openAuth } = params;

  const [myBookmarks, setMyBookmarks] = useState<MarketBookmark[]>([]);

  const bookmarkedMarketIds = useMemo(
    () => new Set(myBookmarks.map((b) => b.marketId)),
    [myBookmarks],
  );

  const bookmarkedMarkets = useMemo(
    () => mergedMarkets.filter((m) => bookmarkedMarketIds.has(m.id)),
    [mergedMarkets, bookmarkedMarketIds],
  );

  const handleSetBookmarked = useCallback(
    async (marketId: string, bookmarked: boolean) => {
      if (!user) {
        openAuth("SIGN_UP");
        return;
      }

      let previous: MarketBookmark[] | null = null;
      const nowIso = new Date().toISOString();
      setMyBookmarks((curr) => {
        previous = curr;
        if (bookmarked) {
          if (curr.some((b) => b.marketId === marketId)) return curr;
          return [{ marketId, createdAt: nowIso }, ...curr];
        }
        return curr.filter((b) => b.marketId !== marketId);
      });

      try {
        const marketProvider =
          mergedMarkets.find((market) => market.id === marketId)?.provider ??
          (marketId.startsWith("limitless:") ? "limitless" : undefined);
        await trpcClient.market.setBookmark.mutate({
          marketId,
          provider: marketProvider,
          bookmarked,
        });
        void trpcClient.events.track
          .mutate({
            sessionId: sessionIdRef.current,
            marketId,
            provider: marketProvider,
            eventType: "bookmark",
            value: bookmarked ? 1 : 0,
          })
          .catch(() => {
            // best effort analytics event
          });
      } catch (err: unknown) {
        console.error("setBookmark failed", err);
        if (previous) setMyBookmarks(previous);
      }
    },
    [mergedMarkets, openAuth, user, sessionIdRef],
  );

  return {
    myBookmarks,
    setMyBookmarks,
    bookmarkedMarketIds,
    bookmarkedMarkets,
    handleSetBookmarked,
  };
}
