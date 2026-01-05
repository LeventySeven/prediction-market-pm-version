'use client';

import React from 'react';
import { X } from 'lucide-react';
import Button from './Button';

export type BetConfirmModalProps = {
  isOpen: boolean;
  onClose: () => void;
  marketTitle: string;
  side: 'YES' | 'NO';
  amount: number;
  newBalance?: number;
  errorMessage?: string | null;
};

export const BetConfirmModal: React.FC<BetConfirmModalProps> = ({
  isOpen,
  onClose,
  marketTitle,
  side,
  amount,
  newBalance,
  errorMessage,
}) => {
  if (!isOpen) return null;

  const isError = Boolean(errorMessage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-black border border-zinc-900 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white"
          aria-label="Close"
        >
          <X size={22} />
        </button>
        <h2 className="text-xl font-bold text-white mb-3">{isError ? 'Bet not accepted' : 'Bet placed'}</h2>
        {isError ? (
          <p className="text-sm text-red-300 mb-4">{errorMessage}</p>
        ) : (
          <>
            <p className="text-sm text-neutral-300 mb-4">
              You placed a bet on:
              <br />
              <span className="font-semibold text-white">{marketTitle}</span>
            </p>
            <div className="space-y-2 text-sm text-neutral-300">
              <div className="flex justify-between">
                <span className="text-neutral-500">Side</span>
                <span
                  className={`font-semibold ${
                    side === 'YES' ? 'text-[#E50C00]' : 'text-[#E50C00]'
                  }`}
                >
                  {side}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Amount</span>
                <span className="font-semibold">${amount.toFixed(2)}</span>
              </div>
              {newBalance !== undefined && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">New balance</span>
                  <span className="font-semibold text-zinc-100">${newBalance.toFixed(2)}</span>
                </div>
              )}
            </div>
          </>
        )}
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>OK</Button>
        </div>
      </div>
    </div>
  );
};

export default BetConfirmModal;