'use client';

import { useCallback, useRef, useState } from "react";
import { trpcClient } from "@/src/utils/trpcClient";

type PublicProfileUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  telegramPhotoUrl: string | null;
};

type PublicProfileBet = {
  marketId: string;
  outcome: "YES" | "NO" | null;
  lastBetAt: string;
  isActive: boolean;
};

type PublicProfileComment = {
  id: string;
  marketId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  likesCount: number;
};

const requireValue = <T,>(v: T | null | undefined, code: string): T => {
  if (v === null || v === undefined) {
    throw new Error(code);
  }
  return v;
};

export function usePublicProfile(params: { lang: "RU" | "EN" }) {
  const { lang } = params;

  const [publicProfileOpen, setPublicProfileOpen] = useState(false);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [publicProfileError, setPublicProfileError] = useState<string | null>(null);
  const [publicProfileUser, setPublicProfileUser] = useState<PublicProfileUser | null>(null);
  const [publicProfilePnl, setPublicProfilePnl] = useState(0);
  const [publicProfileComments, setPublicProfileComments] = useState<PublicProfileComment[]>([]);
  const [publicProfileBets, setPublicProfileBets] = useState<PublicProfileBet[]>([]);
  const publicProfileRequestIdRef = useRef(0);

  const openPublicProfile = useCallback(
    async (userId: string) => {
      setPublicProfileOpen(true);
      setPublicProfileLoading(true);
      setPublicProfileError(null);
      setPublicProfileUser(null);
      setPublicProfilePnl(0);
      setPublicProfileComments([]);
      setPublicProfileBets([]);
      publicProfileRequestIdRef.current += 1;
      const requestId = publicProfileRequestIdRef.current;

      try {
        const [u, stats, comments, bets] = await Promise.all([
          trpcClient.user.publicUser.query({ userId }),
          trpcClient.user.publicUserStats.query({ userId }),
          trpcClient.user.publicUserComments.query({ userId, limit: 50 }),
          trpcClient.user.publicUserVotes.query({ userId, limit: 200 }),
        ]);
        if (requestId !== publicProfileRequestIdRef.current) return;

        setPublicProfileUser({
          id: requireValue(u.id, "PUBLIC_USER_ID_MISSING"),
          username: requireValue(u.username, "PUBLIC_USER_USERNAME_MISSING"),
          displayName: u.displayName ?? null,
          avatarUrl: u.avatarUrl ?? null,
          telegramPhotoUrl: u.telegramPhotoUrl ?? null,
        });
        setPublicProfilePnl(Number(stats.pnlMajor ?? 0));
        setPublicProfileComments(
          (comments ?? []).map((c) => ({
            id: requireValue(c.id, "PUBLIC_COMMENT_ID_MISSING"),
            marketId: requireValue(c.marketId, "PUBLIC_COMMENT_MARKET_ID_MISSING"),
            parentId: c.parentId ?? null,
            body: requireValue(c.body, "PUBLIC_COMMENT_BODY_MISSING"),
            createdAt: requireValue(c.createdAt, "PUBLIC_COMMENT_CREATED_MISSING"),
            likesCount: Number(c.likesCount ?? 0),
          }))
        );
        setPublicProfileBets(
          (bets ?? []).map((b) => ({
            marketId: requireValue(b.marketId, "PUBLIC_BET_MARKET_ID_MISSING"),
            outcome: b.outcome ?? null,
            lastBetAt: requireValue(b.lastBetAt, "PUBLIC_BET_LAST_BET_AT_MISSING"),
            isActive: Boolean(b.isActive),
          }))
        );
      } catch (err) {
        if (requestId !== publicProfileRequestIdRef.current) return;
        console.error("openPublicProfile failed", err);
        setPublicProfileError(lang === "RU" ? "Не удалось загрузить профиль" : "Failed to load profile");
      } finally {
        if (requestId !== publicProfileRequestIdRef.current) return;
        setPublicProfileLoading(false);
      }
    },
    [lang]
  );

  const closePublicProfile = useCallback(() => {
    setPublicProfileOpen(false);
  }, []);

  return {
    publicProfileOpen,
    publicProfileLoading,
    publicProfileError,
    publicProfileUser,
    publicProfilePnl,
    publicProfileComments,
    publicProfileBets,
    openPublicProfile,
    closePublicProfile,
  };
}
