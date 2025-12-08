import React from "react";
import { X } from "lucide-react";
import Button from "./Button";

type ProfileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  email?: string;
  username?: string;
  balance?: number;
  onLogout: () => void;
  bets?: {
    id: number;
    marketTitle: string;
    side: "YES" | "NO";
    amount: number;
    status: string;
    payout: number | null;
    createdAt: string;
    marketOutcome: "YES" | "NO" | null;
    expiresAt?: string | null;
    priceYes?: number | null;
    priceNo?: number | null;
  }[];
  loadingBets?: boolean;
};

const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  email,
  username,
  balance,
  onLogout,
  bets = [],
  loadingBets = false,
}) => {
  if (!isOpen) return null;
  const formatDate = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTimeLeft = (iso?: string | null) => {
    if (!iso) return "—";
    const end = Date.parse(iso);
    if (!Number.isFinite(end)) return "—";
    const diff = end - Date.now();
    if (diff <= 0) return "завершено";
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}д ${hours % 24}ч`;
    if (hours > 0) return `${hours}ч ${minutes % 60}м`;
    return `${minutes}м`;
  };

  const formatChance = (yes?: number | null, no?: number | null) => {
    if (yes == null || no == null) return "—";
    const total = yes + no;
    if (total === 0) return "50%";
    const chanceYes = Math.round((no / total) * 100);
    return `${chanceYes}% Да`;
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-neutral-900 border border-neutral-700 w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-fade-in-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white"
          aria-label="Закрыть"
        >
          <X size={22} />
        </button>
        <h2 className="text-xl font-bold text-white mb-4">Профиль</h2>
        <div className="space-y-3 text-sm text-neutral-300">
          <div className="flex justify-between">
            <span className="text-neutral-500">Username</span>
            <span className="font-semibold">{username || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Email</span>
            <span className="font-semibold">{email || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Баланс</span>
            <span className="font-semibold text-[#BEFF1D]">
              {balance !== undefined ? `$${balance.toFixed(2)}` : "—"}
            </span>
          </div>
        </div>
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-white mb-2">Мои ставки</h3>
          <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
            {loadingBets ? (
              <p className="text-sm text-neutral-500">Загрузка...</p>
            ) : bets.length === 0 ? (
              <p className="text-sm text-neutral-500">Ставок пока нет</p>
            ) : (
              bets.map((b) => (
                <div
                  key={b.id}
                  className="border border-neutral-800 rounded-lg p-3 bg-neutral-900/70"
                >
                  <div className="flex justify-between text-sm text-white">
                    <span className="font-semibold line-clamp-1">{b.marketTitle}</span>
                    <span
                      className={`text-xs font-bold ${
                        b.side === "YES" ? "text-[#BEFF1D]" : ""
                      }`}
                      style={b.side === "NO" ? { color: "rgba(250, 73, 159, 1)" } : undefined}
                    >
                      {b.side}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-400 mt-1 flex justify-between">
                    <span>Сумма: ${b.amount.toFixed(2)}</span>
                    <span>
                      Выплата: {b.payout !== null ? `$${b.payout.toFixed(2)}` : "—"}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1 flex justify-between">
                    <span>{formatDate(b.createdAt)}</span>
                    <span>
                      Статус:{" "}
                      <span className="font-semibold text-neutral-300">{b.status}</span>
                      {b.marketOutcome && ` • Итог: ${b.marketOutcome}`}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1 flex justify-between">
                    <span>Окончание: {formatDate(b.expiresAt ?? undefined)}</span>
                    <span>Осталось: {formatTimeLeft(b.expiresAt)}</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1">
                    Шанс: {formatChance(b.priceYes ?? null, b.priceNo ?? null)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
          <Button variant="secondary" onClick={onLogout}>
            Выйти
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;

