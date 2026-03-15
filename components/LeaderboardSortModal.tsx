'use client';

import { X } from "lucide-react";

type LeaderboardSort = "PNL" | "BETS";

export type LeaderboardSortModalProps = {
  lang: "RU" | "EN";
  leaderboardSort: LeaderboardSort;
  onSortChange: (sort: LeaderboardSort) => void;
  onClose: () => void;
};

export default function LeaderboardSortModal({
  lang,
  leaderboardSort,
  onSortChange,
  onClose,
}: LeaderboardSortModalProps) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4" data-swipe-ignore="true">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-900 bg-black p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="text-sm font-semibold text-zinc-100">
            {lang === "RU" ? "Сортировка" : "Sort"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center text-zinc-300"
            aria-label={lang === "RU" ? "Закрыть" : "Close"}
          >
            <X size={16} />
          </button>
        </div>

        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          {lang === "RU" ? "Сортировка" : "Sort"}
        </div>
        <div role="radiogroup" className="space-y-2">
          {([
            { id: "PNL" as const, labelRu: "PnL", labelEn: "PnL" },
            { id: "BETS" as const, labelRu: "Ставки", labelEn: "Bets" },
          ]).map((opt) => {
            const selected = leaderboardSort === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  onSortChange(opt.id);
                  onClose();
                }}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                  selected
                    ? "border-[rgba(245,68,166,1)] bg-[rgba(245,68,166,0.10)] text-white"
                    : "border-zinc-900 bg-zinc-950/30 text-zinc-300 hover:bg-zinc-950/50"
                }`}
              >
                <div className="text-sm font-semibold">{lang === "RU" ? opt.labelRu : opt.labelEn}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
