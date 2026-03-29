import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { X, MessageCircle, Clock } from "lucide-react";
import type { Market } from "../types";

type PublicUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  telegramPhotoUrl: string | null;
};

type PublicComment = {
  id: string;
  marketId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  likesCount: number;
};

type PublicBet = {
  marketId: string;
  outcome: "YES" | "NO" | null;
  lastBetAt: string;
  isActive: boolean;
};

type PublicUserProfileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  lang: "RU" | "EN";
  loading: boolean;
  error: string | null;
  user: PublicUser | null;
  pnlMajor: number;
  bets: PublicBet[];
  comments: PublicComment[];
  markets: Market[];
  onMarketClick: (marketId: string) => void;
};

const hashStringToInt = (value: string) => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const accentPairFromSeed = (seed: string) => {
  const h = hashStringToInt(seed);
  const hueA = h % 360;
  const hueB = (hueA + 32 + ((h >> 8) % 48)) % 360;
  return {
    a: `hsla(${hueA}, 85%, 58%, 0.20)`,
    b: `hsla(${hueB}, 85%, 58%, 0.16)`,
  };
};

const accentPairFromHue = (hueA: number) => {
  const hueB = (hueA + 28) % 360;
  return {
    a: `hsla(${hueA}, 85%, 58%, 0.20)`,
    b: `hsla(${hueB}, 85%, 58%, 0.16)`,
  };
};

const hueFromRgb = (r: number, g: number, b: number) => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d < 1e-9) return 0;
  let h = 0;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
};

const sampleAvatarHue = async (src: string): Promise<number | null> => {
  try {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";

    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("AVATAR_LOAD_FAILED"));
    });

    img.src = src;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    const r = data[0] ?? 0;
    const g = data[1] ?? 0;
    const b = data[2] ?? 0;
    return hueFromRgb(r, g, b);
  } catch {
    return null;
  }
};

const formatSignedMoney = (v: number) => `${v >= 0 ? "+" : "-"}$${Math.abs(v).toFixed(2)}`;

const PublicUserProfileModal: React.FC<PublicUserProfileModalProps> = ({
  isOpen,
  onClose,
  lang,
  loading,
  error,
  user,
  pnlMajor,
  bets,
  comments,
  markets,
  onMarketClick,
}) => {

  const marketById = useMemo(() => new Map(markets.map((m) => [m.id, m])), [markets]);
  const displayName = user ? (user.displayName ?? user.username) : "";
  const avatarSrc = user ? (user.avatarUrl ?? user.telegramPhotoUrl) : null;

  const accentSeed = String(user?.avatarUrl ?? user?.telegramPhotoUrl ?? user?.id ?? displayName ?? "seed");
  const [accent, setAccent] = useState(() => accentPairFromSeed(accentSeed));

  useEffect(() => {
    const src = avatarSrc && avatarSrc.trim().length > 0 ? avatarSrc : null;
    if (!src) {
      setAccent(accentPairFromSeed(accentSeed));
      return;
    }
    let cancelled = false;
    void (async () => {
      const hue = await sampleAvatarHue(src);
      if (cancelled) return;
      setAccent(hue === null ? accentPairFromSeed(accentSeed) : accentPairFromHue(hue));
    })();
    return () => {
      cancelled = true;
    };
  }, [avatarSrc, accentSeed]);

  const pnlIsPositive = pnlMajor >= 0;
  const [tab, setTab] = useState<"BETS" | "COMMENTS">("BETS");
  const yesLabel = lang === "RU" ? "Да" : "Yes";
  const noLabel = lang === "RU" ? "Нет" : "No";

  const ongoingBets = useMemo(
    () =>
      (bets ?? [])
        .filter((b) => b.isActive)
        .sort((a, b) => new Date(b.lastBetAt).getTime() - new Date(a.lastBetAt).getTime()),
    [bets]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto"
      data-swipe-ignore="true"
    >
      <div className="w-full max-w-2xl bg-black border border-zinc-900 rounded-2xl overflow-hidden max-h-[calc(100vh-2rem)] sm:max-h-[92vh] flex flex-col mt-6 sm:mt-0">
        <div
          className="relative overflow-hidden p-5 border-b border-zinc-900"
          style={{
            backgroundImage: `radial-gradient(700px 220px at 0% 0%, ${accent.a}, transparent 60%), radial-gradient(520px 180px at 100% 0%, ${accent.b}, transparent 55%)`,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 h-9 w-9 rounded-full border border-zinc-900 bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
            aria-label={lang === "RU" ? "Закрыть" : "Close"}
          >
            <X size={16} />
          </button>

          <div className="flex items-center gap-4">
            <div className="relative h-14 w-14 rounded-full border border-zinc-900 bg-zinc-950/40 overflow-hidden flex items-center justify-center">
              {avatarSrc ? (
                <Image src={avatarSrc} alt={displayName} fill unoptimized className="object-cover" />
              ) : (
                <div className="text-zinc-400 font-bold">{displayName.slice(0, 2).toUpperCase()}</div>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold text-white truncate">{displayName || (lang === "RU" ? "Пользователь" : "User")}</div>
              {user?.username ? (
                <div className="text-xs text-zinc-400 font-mono truncate">@{user.username}</div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 border border-zinc-900 bg-black/60 rounded-2xl p-4">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">PnL</div>
            <div
              className={`text-2xl font-mono font-bold ${
                pnlIsPositive ? "text-[rgba(190,255,29,1)]" : "text-[rgba(245,68,166,1)]"
              }`}
            >
              {formatSignedMoney(pnlMajor)}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-5">
            {/* Tabs */}
            <div className="mb-4 flex items-center gap-2 border border-zinc-900 bg-black rounded-full p-1">
              <button
                type="button"
                onClick={() => setTab("BETS")}
                className={`flex-1 rounded-full py-2 text-[11px] font-bold uppercase tracking-wider transition ${
                  tab === "BETS"
                    ? "bg-zinc-950 text-white border border-zinc-800"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {lang === "RU" ? "Ставки" : "Bets"}
              </button>
              <button
                type="button"
                onClick={() => setTab("COMMENTS")}
                className={`flex-1 rounded-full py-2 text-[11px] font-bold uppercase tracking-wider transition ${
                  tab === "COMMENTS"
                    ? "bg-zinc-950 text-white border border-zinc-800"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {lang === "RU" ? "Комментарии" : "Comments"}
              </button>
            </div>

            {loading ? (
              <div className="py-10 text-center text-zinc-500 text-sm">{lang === "RU" ? "Загрузка..." : "Loading..."}</div>
            ) : error ? (
              <div className="py-10 text-center text-zinc-500 text-sm">{error}</div>
            ) : (
              tab === "BETS" ? (
                <div className="space-y-3">
                  {ongoingBets.length === 0 ? (
                    <div className="text-sm text-zinc-500">
                      {lang === "RU" ? "Нет активных ставок" : "No ongoing bets"}
                    </div>
                  ) : (
                    ongoingBets.map((b) => {
                      const m = marketById.get(b.marketId);
                      const title = m ? ((lang === "RU" ? m.titleRu : m.titleEn) || m.title) : b.marketId;
                      const when = new Date(b.lastBetAt).toLocaleString(lang === "RU" ? "ru-RU" : "en-US", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const sideLabel = b.outcome === "YES" ? yesLabel : b.outcome === "NO" ? noLabel : (lang === "RU" ? "Выбор" : "Selection");
                      const sideColor = b.outcome === "YES" ? "text-[rgba(190,255,29,1)]" : "text-[rgba(245,68,166,1)]";
                      return (
                        <button
                          key={`${b.marketId}:${b.outcome}`}
                          type="button"
                          className="w-full text-left border border-zinc-900 bg-black rounded-2xl p-4 hover:bg-zinc-950/40 transition-colors"
                          onClick={() => onMarketClick(b.marketId)}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-zinc-100 truncate">{title}</div>
                              <div className="mt-1 text-xs text-zinc-500 flex items-center gap-2">
                                <span className={`font-semibold ${sideColor}`}>{sideLabel}</span>
                                <span className="text-zinc-700">•</span>
                                <span className="inline-flex items-center gap-1">
                                  <Clock size={12} /> {when}
                                </span>
                              </div>
                            </div>
                            <div className="text-xs text-zinc-500 flex-shrink-0">
                              {lang === "RU" ? "Открыта" : "Open"}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {comments.length === 0 ? (
                    <div className="text-sm text-zinc-500">{lang === "RU" ? "Пока нет комментариев" : "No comments yet"}</div>
                  ) : (
                    comments.map((c) => {
                      const m = marketById.get(c.marketId);
                      const title = m ? ((lang === "RU" ? m.titleRu : m.titleEn) || m.title) : c.marketId;
                      const when = new Date(c.createdAt).toLocaleString(lang === "RU" ? "ru-RU" : "en-US", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left border border-zinc-900 bg-black rounded-2xl p-4 hover:bg-zinc-950/40 transition-colors"
                          onClick={() => onMarketClick(c.marketId)}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-zinc-100 truncate">{title}</div>
                              <div className="mt-1 text-xs text-zinc-500 flex items-center gap-2">
                                <span className="inline-flex items-center gap-1">
                                  <MessageCircle size={12} /> {when}
                                </span>
                                {c.parentId ? (
                                  <>
                                    <span className="text-zinc-700">•</span>
                                    <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                                      {lang === "RU" ? "Ответ" : "Reply"}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                              <div className="mt-2 text-sm text-zinc-300 line-clamp-3">{c.body}</div>
                            </div>
                            <div className="text-xs text-zinc-500 flex-shrink-0">{lang === "RU" ? "Лайки" : "Likes"}: {c.likesCount}</div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicUserProfileModal;


