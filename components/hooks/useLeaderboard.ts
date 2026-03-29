'use client';

import { useState, useCallback } from "react";
import { trpcClient } from "@/src/utils/trpcClient";
import { leaderboardUsersSchema } from "@/src/schemas/leaderboard";
import type { LeaderboardUser } from "@/types";

export type LeaderboardSort = "PNL" | "BETS";

type ErrorLike =
  | string
  | Error
  | {
      message?: string;
      data?: { message?: string };
    }
  | null
  | undefined;

function getErrorMessage(error: ErrorLike): string | undefined {
  if (!error) return undefined;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error.message === "string") return error.message;
  if (error.data && typeof error.data.message === "string") return error.data.message;
  return undefined;
}

export function useLeaderboard(params: { lang: "RU" | "EN" }) {
  const { lang } = params;

  const [leaderboardUsers, setLeaderboardUsers] = useState<LeaderboardUser[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [leaderboardSort, setLeaderboardSort] = useState<LeaderboardSort>("PNL");
  const [leaderboardSortOpen, setLeaderboardSortOpen] = useState(false);

  const loadLeaderboard = useCallback(async (sortBy: LeaderboardSort = leaderboardSort) => {
    setLoadingLeaderboard(true);
    setLeaderboardError(null);
    try {
      const usersRaw = await trpcClient.user.leaderboard.query({
        limit: 100,
        sortBy: sortBy === "PNL" ? "pnl" : "bets",
      });
      const users: LeaderboardUser[] = leaderboardUsersSchema.parse(usersRaw);
      setLeaderboardUsers(users);
    } catch (err) {
      console.error("Failed to load leaderboard", err);
      const base = lang === "RU" ? "Не удалось загрузить лидерборд" : "Failed to load leaderboard";
      setLeaderboardError(`${base}: ${getErrorMessage(err as ErrorLike)}`);
      // Keep the previous list if we have one; avoid flashing "No data yet" on transient errors.
      setLeaderboardUsers((prev) => prev);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [lang, leaderboardSort]);

  return {
    leaderboardUsers,
    loadingLeaderboard,
    leaderboardError,
    leaderboardSort,
    setLeaderboardSort,
    leaderboardSortOpen,
    setLeaderboardSortOpen,
    loadLeaderboard,
  };
}
