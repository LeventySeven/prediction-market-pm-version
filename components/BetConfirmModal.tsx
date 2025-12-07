import React from "react";
import { X } from "lucide-react";
import Button from "./Button";

type BetConfirmModalProps = {
  isOpen: boolean;
  onClose: () => void;
  marketTitle: string;
  side: "YES" | "NO";
  amount: number;
  newBalance?: number;
};

const BetConfirmModal: React.FC<BetConfirmModalProps> = ({
  isOpen,
  onClose,
  marketTitle,
  side,
  amount,
  newBalance,
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white"
          aria-label="Закрыть"
        >
          <X size={22} />
        </button>
        <h2 className="text-xl font-bold text-white mb-3">Ставка принята</h2>
        <p className="text-sm text-neutral-300 mb-4">
          Вы поставили на рынок:
          <br />
          <span className="font-semibold text-white">{marketTitle}</span>
        </p>
        <div className="space-y-2 text-sm text-neutral-300">
          <div className="flex justify-between">
            <span className="text-neutral-500">Сторона</span>
            <span className={side === "YES" ? "text-[#BEFF1D]" : "text-red-400"}>
              {side}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Сумма</span>
            <span className="font-semibold">${amount.toFixed(2)}</span>
          </div>
          {newBalance !== undefined && (
            <div className="flex justify-between">
              <span className="text-neutral-500">Баланс</span>
              <span className="font-semibold text-[#BEFF1D]">
                ${newBalance.toFixed(2)}
              </span>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Ок</Button>
        </div>
      </div>
    </div>
  );
};

export default BetConfirmModal;

