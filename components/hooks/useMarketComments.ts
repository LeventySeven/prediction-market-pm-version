'use client';

import { useCallback, useState } from "react";
import type { Comment as MarketComment } from "@/types";
import { trpcClient } from "@/src/utils/trpcClient";
import { marketCommentsSchema } from "@/src/schemas/comments";
import { buildInitialsAvatarDataUrl } from "@/lib/avatar";

export function useMarketComments(params: {
  lang: "RU" | "EN";
  initialMarketComments: MarketComment[];
  maybeRequireRelogin: (err: unknown) => boolean;
}) {
  const { lang, initialMarketComments, maybeRequireRelogin } = params;

  const [marketComments, setMarketComments] = useState<MarketComment[]>(initialMarketComments);
  const [marketCommentsError, setMarketCommentsError] = useState<string | null>(null);

  const handlePostMarketComment = useCallback(
    async (params: {
      marketId: string;
      provider?: "polymarket" | "limitless";
      text: string;
      parentId?: string | null;
    }) => {
      let created: Awaited<ReturnType<typeof trpcClient.market.postMarketComment.mutate>>;
      try {
        created = await trpcClient.market.postMarketComment.mutate({
          marketId: params.marketId,
          provider: params.provider,
          body: params.text,
          parentId: params.parentId ?? null,
        });
      } catch (err) {
        maybeRequireRelogin(err);
        throw err;
      }
      const parsed = marketCommentsSchema.parse([created])[0];
      const userLabel = parsed.authorUsername ? `${parsed.authorName} (@${parsed.authorUsername})` : parsed.authorName;
      const avatar = parsed.authorAvatarUrl || buildInitialsAvatarDataUrl(parsed.authorName, { bg: "#333333", fg: "#ffffff" });
      const timestamp = new Date(parsed.createdAt).toLocaleString(lang === "RU" ? "ru-RU" : "en-US", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      const ui: MarketComment = {
        id: parsed.id,
        userId: parsed.userId,
        username: parsed.authorUsername ?? null,
        user: userLabel,
        avatar,
        text: parsed.body,
        createdAt: parsed.createdAt,
        timestamp,
        likes: parsed.likesCount ?? 0,
        likedByMe: parsed.likedByMe ?? false,
        parentId: parsed.parentId ?? null,
      };
      setMarketComments((prev) => [ui, ...prev]);
    },
    [lang, maybeRequireRelogin]
  );

  const handleToggleMarketCommentLike = useCallback(async (commentId: string) => {
    // Optimistic UI update for instant feedback.
    let previous: { likes: number; likedByMe: boolean } | null = null;
    setMarketComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const likedByMe = Boolean(c.likedByMe);
        previous = { likes: c.likes, likedByMe };
        const nextLiked = !likedByMe;
        const delta = nextLiked ? 1 : -1;
        return { ...c, likedByMe: nextLiked, likes: Math.max(0, c.likes + delta) };
      })
    );

    try {
      const res = await trpcClient.market.toggleMarketCommentLike.mutate({ commentId });
      setMarketComments((prev) =>
        prev.map((c) => (c.id === res.commentId ? { ...c, likes: res.likesCount, likedByMe: res.liked } : c))
      );
    } catch (err) {
      console.error("toggleMarketCommentLike failed", err);
      maybeRequireRelogin(err);
      if (previous) {
        setMarketComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, likes: previous!.likes, likedByMe: previous!.likedByMe } : c))
        );
      }
    }
  }, [maybeRequireRelogin]);

  return {
    marketComments,
    setMarketComments,
    marketCommentsError,
    setMarketCommentsError,
    handlePostMarketComment,
    handleToggleMarketCommentLike,
  };
}
