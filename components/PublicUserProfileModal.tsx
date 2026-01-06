import React, { useEffect, useMemo, useState } from "react";
import { X, MessageCircle, Zap, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { Market } from "../types";

type PublicUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  telegramPhotoUrl: string | null;
};

type PublicVote = { marketId: string; outcome: "YES" | "NO"; lastBetAt: string; isActive: boolean };
type PublicComment = {
  id: string;
  marketId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  likesCount: number;
};

type PublicPnlPoint = { day: string; pnlMajor: number };
type PublicTx = {
  id: string;
  kind: string;
  amountMajor: number;
  marketId: string | null;
  marketTitleRu: string | null;
  marketTitleEn: string | null;
  createdAt: string;
};

type PublicUserProfileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  lang: "RU" | "EN";
  loading: boolean;
  error: string | null;
  user: PublicUser | null;
  pnlMajor: number;
  pnlSeries: PublicPnlPoint[];
  votes: PublicVote[];
  comments: PublicComment[];
  transactions: PublicTx[];
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

const buildSparklinePath = (values: number[]) => {
  const W = 100;
  const H = 40;
  const P = 2;
  const n = values.length;
  if (n === 0) return { lineD: "" };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-9, max - min);

  const toX = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const toY = (v: number) => {
    const t = (v - min) / span;
    return P + (1 - t) * (H - P * 2);
  };

  const points = values.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  return { lineD };
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
  pnlSeries,
  votes,
  comments,
  transactions,
  markets,
  onMarketClick,
}) => {
  const [tab, setTab] = useState<"BETS" | "COMMENTS" | "TXS">("BETS");

  const marketById = useMemo(() => new Map(markets.map((m) => [m.id, m])), [markets]);
  const displayName = user ? (user.displayName ?? user.username) : "";
  const avatarSrc = user ? (user.avatarUrl ?? user.telegramPhotoUrl) : null;

  const [accent, setAccent] = useState(() => accentPairFromSeed(user?.id ?? "seed"));

  useEffect(() => {
    const seed = user?.id ?? "seed";
    const src = avatarSrc && avatarSrc.trim().length > 0 ? avatarSrc : null;
    if (!src) {
      setAccent(accentPairFromSeed(seed));
      return;
    }
    let cancelled = false;
    void (async () => {
      const hue = await sampleAvatarHue(src);
      if (cancelled) return;
      if (hue === null) {
        setAccent(accentPairFromSeed(seed));
      } else {
        setAccent(accentPairFromHue(hue));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, avatarSrc]);

  const pnlIsPositive = pnlMajor >= 0;
  const seriesCumulative = useMemo(() => {
    let acc = 0;
    return pnlSeries.map((p) => {
      acc += p.pnlMajor;
      return acc;
    });
  }, [pnlSeries]);
  const spark = useMemo(() => buildSparklinePath(seriesCumulative), [seriesCumulative]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-black border border-zinc-900 rounded-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div
          className="relative p-5 border-b border-zinc-900"
          style={{
            background: `radial-gradient(900px circle at 20% 0%, ${accent.a} 0%, transparent 55%), radial-gradient(900px circle at 90% 20%, ${accent.b} 0%, transparent 55%)`,
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
            <div className="h-14 w-14 rounded-full border border-zinc-900 bg-zinc-950/40 overflow-hidden flex items-center justify-center">
              {avatarSrc ? (
                <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
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

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="border border-zinc-900 bg-black/60 rounded-2xl p-4">
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">PnL</div>
              <div className={`text-2xl font-mono font-bold ${pnlIsPositive ? "text-[rgba(245,68,166,1)]" : "text-[rgba(245,68,166,1)]"}`}>
                {formatSignedMoney(pnlMajor)}
              </div>
            </div>
            <div className="border border-zinc-900 bg-black/60 rounded-2xl p-4 flex items-center justify-center">
              <svg viewBox="0 0 100 40" className="w-full h-10">
                <path d={spark.lineD} fill="none" stroke="rgba(245,68,166,1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <div className="mt-4 border-b border-zinc-900 flex">
            <button
              type="button"
              onClick={() => setTab("BETS")}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                tab === "BETS" ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-white"
              }`}
            >
              {lang === "RU" ? "Ставки" : "Bets"}
            </button>
            <button
              type="button"
              onClick={() => setTab("COMMENTS")}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                tab === "COMMENTS" ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-white"
              }`}
            >
              {lang === "RU" ? "Комментарии" : "Comments"}
            </button>
            <button
              type="button"
              onClick={() => setTab("TXS")}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                tab === "TXS" ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-white"
              }`}
            >
              {lang === "RU" ? "Транзакции" : "Transactions"}
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center text-zinc-500 text-sm">{lang === "RU" ? "Загрузка..." : "Loading..."}</div>
          ) : error ? (
            <div className="py-10 text-center text-zinc-500 text-sm">{error}</div>
          ) : tab === "BETS" ? (
            <div className="space-y-6">
              {votes.length === 0 ? (
                <div className="text-sm text-zinc-500">{lang === "RU" ? "Пока нет ставок" : "No bets yet"}</div>
              ) : (
                (() => {
                  const ongoing = votes.filter((v) => {
                    const m = marketById.get(v.marketId);
                    const isResolved = Boolean(m && (m.state === "resolved" || m.outcome));
                    // Ongoing means: market not resolved AND user still has an active position (not sold out).
                    return !isResolved && v.isActive;
                  });
                  const completed = votes.filter((v) => {
                    const m = marketById.get(v.marketId);
                    if (!m) return false;
                    return m.state === "resolved" || Boolean(m.outcome);
                  });
                  const sold = votes.filter((v) => {
                    const m = marketById.get(v.marketId);
                    const isResolved = Boolean(m && (m.state === "resolved" || m.outcome));
                    // Sold means: market not resolved but user has no active position anymore.
                    return !isResolved && !v.isActive;
                  });

                  const renderVote = (v: PublicVote) => {
                    const m = marketById.get(v.marketId);
                    const title = m ? ((lang === "RU" ? m.titleRu : m.titleEn) || m.title) : v.marketId;
                    const sideLabel = v.outcome === "YES" ? (lang === "RU" ? "ДА" : "YES") : (lang === "RU" ? "НЕТ" : "NO");
                    const when = new Date(v.lastBetAt).toLocaleDateString(lang === "RU" ? "ru-RU" : "en-US", {
                      year: "numeric",
                      month: "short",
                      day: "2-digit",
                    });
                    const isCompleted = Boolean(m && (m.state === "resolved" || m.outcome));
                    const marketOutcome = m?.outcome ?? null;
                    const won = isCompleted && marketOutcome ? marketOutcome === v.outcome : null;
                    const statusLabel = !isCompleted
                      ? v.isActive
                        ? (lang === "RU" ? "Текущая" : "Ongoing")
                        : (lang === "RU" ? "Продано" : "Sold")
                      : won
                      ? (lang === "RU" ? "ВЫИГРЫШ" : "WON")
                      : (lang === "RU" ? "ПОТЕРЯ" : "LOST");

                    return (
                      <button
                        key={`${v.marketId}-${v.outcome}`}
                        type="button"
                        className="w-full text-left border border-zinc-900 bg-black rounded-2xl p-4 hover:bg-zinc-950/40 transition-colors"
                        onClick={() => onMarketClick(v.marketId)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-zinc-100 truncate">{title}</div>
                            <div className="mt-1 text-xs text-zinc-500 flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                                <Zap size={12} /> {when}
                              </span>
                              <span className="text-zinc-700">•</span>
                              <span className="inline-flex items-center justify-center rounded-full border border-[rgba(245,68,166,1)] bg-black px-2 py-0.5 text-[10px] font-bold text-[rgba(245,68,166,1)]">
                                {sideLabel}
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {m ? <div className="font-mono text-sm font-semibold text-zinc-100">{Math.round(m.chance)}%</div> : null}
                            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{statusLabel}</div>
                          </div>
                        </div>
                      </button>
                    );
                  };

                  return (
                    <>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-1">
                          {lang === "RU" ? "Текущие" : "Ongoing"}
                        </div>
                        {ongoing.length === 0 ? (
                          <div className="text-sm text-zinc-500 px-1">{lang === "RU" ? "Нет активных ставок" : "No active bets"}</div>
                        ) : (
                          <div className="space-y-3">{ongoing.map(renderVote)}</div>
                        )}
                      </div>

                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-1">
                          {lang === "RU" ? "Закрытые" : "Closed"}
                        </div>
                        {sold.length === 0 ? (
                          <div className="text-sm text-zinc-500 px-1">{lang === "RU" ? "Нет закрытых ставок" : "No closed bets"}</div>
                        ) : (
                          <div className="space-y-3">{sold.map(renderVote)}</div>
                        )}
                      </div>

                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-1">
                          {lang === "RU" ? "Завершенные" : "Completed"}
                        </div>
                        {completed.length === 0 ? (
                          <div className="text-sm text-zinc-500 px-1">{lang === "RU" ? "Нет завершенных ставок" : "No completed bets"}</div>
                        ) : (
                          <div className="space-y-3">{completed.map(renderVote)}</div>
                        )}
                      </div>
                    </>
                  );
                })()
              )}
            </div>
          ) : tab === "COMMENTS" ? (
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
          ) : (
            <div className="space-y-3">
              {transactions.length === 0 ? (
                <div className="text-sm text-zinc-500">{lang === "RU" ? "Пока нет транзакций" : "No transactions yet"}</div>
              ) : (
                transactions.map((t) => {
                  const title =
                    t.marketId
                      ? ((lang === "RU" ? t.marketTitleRu : t.marketTitleEn) || t.marketId)
                      : (lang === "RU" ? "Система" : "System");
                  const when = new Date(t.createdAt).toLocaleString(lang === "RU" ? "ru-RU" : "en-US", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const amt = t.amountMajor;
                  const positive = amt >= 0;
                  const icon = positive ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="w-full text-left border border-zinc-900 bg-black rounded-2xl p-4 hover:bg-zinc-950/40 transition-colors"
                      onClick={() => {
                        if (t.marketId) onMarketClick(t.marketId);
                      }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-100 truncate">{title}</div>
                          <div className="mt-1 text-xs text-zinc-500 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1">
                              {icon} {t.kind}
                            </span>
                            <span className="text-zinc-700">•</span>
                            <span className="uppercase tracking-wider text-[10px]">{when}</span>
                          </div>
                        </div>
                        <div className={`text-right flex-shrink-0 font-mono text-sm font-semibold ${positive ? "text-[rgba(245,68,166,1)]" : "text-[rgba(245,68,166,1)]"}`}>
                          {formatSignedMoney(amt)}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PublicUserProfileModal;


