'use client';

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Heart, MessageCircle, TrendingUp, Bookmark, Loader2 } from "lucide-react";
import { trpcClient } from "@/src/utils/trpcClient";
import { buildInitialsAvatarDataUrl } from "@/lib/avatar";

type ActivityItem = {
  id: string;
  type: "comment" | "trade" | "bookmark";
  actorName: string;
  actorUsername: string | null;
  actorAvatarUrl: string | null;
  marketId: string;
  marketTitle: string | null;
  body: string | null;
  createdAt: string;
};

const ICON_MAP = {
  comment: MessageCircle,
  trade: TrendingUp,
  bookmark: Bookmark,
} as const;

const ACCENT_MAP = {
  comment: "text-[rgba(190,255,29,1)]",
  trade: "text-[rgba(245,68,166,1)]",
  bookmark: "text-yellow-400",
} as const;

const formatRelativeTime = (iso: string): string => {
  const diff = Date.now() - Date.parse(iso);
  if (diff < 0) return "now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const actionLabel = (type: ActivityItem["type"], lang: "RU" | "EN"): string => {
  switch (type) {
    case "comment":
      return lang === "RU" ? "прокомментировал(а)" : "commented on";
    case "trade":
      return lang === "RU" ? "сделал(а) ставку на" : "placed a bet on";
    case "bookmark":
      return lang === "RU" ? "добавил(а) в избранное" : "bookmarked";
  }
};

interface ActivityFeedProps {
  lang: "RU" | "EN";
  onMarketClick?: (marketId: string) => void;
}

export default function ActivityFeed({ lang, onMarketClick }: ActivityFeedProps) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await trpcClient.feed.getActivity.query({ limit: 30 });
      setItems(res.items as ActivityItem[]);
    } catch {
      setError(lang === "RU" ? "Не удалось загрузить ленту" : "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { void load(); }, [load]);

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="px-4 py-20 text-center text-sm text-zinc-500">
        <p>{error}</p>
        <button type="button" onClick={() => void load()} className="mt-3 text-xs text-zinc-400 underline">
          {lang === "RU" ? "Повторить" : "Retry"}
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-20 text-center">
        <Image src="/pink.svg" alt="" width={48} height={22} className="mx-auto mb-4 opacity-40" />
        <p className="text-sm text-zinc-500">
          {lang === "RU" ? "Пока нет активности" : "No activity yet"}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-900/60">
      {items.map((item) => {
        const Icon = ICON_MAP[item.type];
        const accent = ACCENT_MAP[item.type];
        const avatar = item.actorAvatarUrl || buildInitialsAvatarDataUrl(item.actorName, { bg: "#222", fg: "#fff" });

        return (
          <div key={item.id} className="flex gap-3 px-4 py-3.5 hover:bg-zinc-950/40 transition-colors">
            {/* Accent icon */}
            <div className="pt-0.5">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900/60 ${accent}`}>
                <Icon size={14} />
              </div>
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              {/* Actor row */}
              <div className="flex items-center gap-2 mb-0.5">
                <Image
                  src={avatar}
                  alt={item.actorName}
                  width={20}
                  height={20}
                  unoptimized
                  className="h-5 w-5 rounded-full object-cover border border-zinc-800"
                />
                <span className="truncate text-sm font-semibold text-zinc-100">
                  {item.actorName}
                </span>
                {item.actorUsername && (
                  <span className="truncate text-xs text-zinc-500">
                    @{item.actorUsername}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-[11px] text-zinc-600">
                  {formatRelativeTime(item.createdAt)}
                </span>
              </div>

              {/* Action text */}
              <p className="text-[13px] text-zinc-400 leading-snug">
                <span>{actionLabel(item.type, lang)} </span>
                {item.marketTitle && (
                  <button
                    type="button"
                    onClick={() => onMarketClick?.(item.marketId)}
                    className="text-zinc-200 font-medium hover:underline"
                  >
                    &ldquo;{item.marketTitle}&rdquo;
                  </button>
                )}
              </p>

              {/* Comment body */}
              {item.type === "comment" && item.body && (
                <p className="mt-1.5 rounded-xl bg-zinc-900/40 px-3 py-2 text-[13px] text-zinc-300 leading-relaxed border border-zinc-800/50">
                  {item.body}
                </p>
              )}

              {/* Interaction row */}
              <div className="mt-2 flex items-center gap-5">
                <button type="button" className="flex items-center gap-1.5 text-zinc-600 hover:text-[rgba(245,68,166,1)] transition-colors">
                  <Heart size={13} />
                </button>
                {item.type === "comment" && (
                  <button
                    type="button"
                    onClick={() => onMarketClick?.(item.marketId)}
                    className="flex items-center gap-1.5 text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    <MessageCircle size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
