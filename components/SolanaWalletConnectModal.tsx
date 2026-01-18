'use client';

import React, { useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';
import { X, AlertTriangle } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
};

const PRIORITY: string[] = ['Phantom', 'Solflare', 'WalletConnect'];

export default function SolanaWalletConnectModal({ open, onClose, title = 'Connect wallet' }: Props) {
  const { wallets, select, connect, connecting } = useWallet();
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const score = (name: string) => {
      const idx = PRIORITY.indexOf(name);
      return idx === -1 ? 999 : idx;
    };
    return [...wallets].sort((a, b) => {
      const an = String(a.adapter.name);
      const bn = String(b.adapter.name);
      const sa = score(an);
      const sb = score(bn);
      if (sa !== sb) return sa - sb;
      return an.localeCompare(bn);
    });
  }, [wallets]);

  if (!open) return null;

  const handleSelect = async (name: WalletName) => {
    setError(null);
    select(name);
    onClose();
    // `select()` updates context state; `connect()` needs to run after that update lands.
    setTimeout(() => {
      connect().catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
    }, 0);
  };

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-label="Close wallet modal"
      />

      <div className="absolute inset-x-0 top-16 mx-auto w-[min(520px,calc(100vw-2rem))] rounded-2xl border border-zinc-900 bg-black shadow-2xl">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-zinc-900">
          <div className="min-w-0">
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{title}</div>
            <div className="text-sm text-zinc-300 mt-1">Choose a wallet (Phantom / Solflare / WalletConnect)</div>
          </div>
          <button
            type="button"
            className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 text-zinc-200"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {error ? (
          <div className="p-4 border-b border-zinc-900 text-sm text-zinc-300 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 text-[rgba(245,68,166,1)]" />
            <div className="min-w-0">
              <div className="font-semibold">Wallet connection failed</div>
              <div className="text-zinc-500 break-words">{error}</div>
            </div>
          </div>
        ) : null}

        <div className="p-4">
          <div className="grid grid-cols-1 gap-3">
            {sorted.map((w) => {
              const name = w.adapter.name;
              const icon = w.adapter.icon;
              return (
                <button
                  key={String(name)}
                  type="button"
                  disabled={connecting}
                  onClick={() => handleSelect(name)}
                  className="w-full flex items-center gap-3 rounded-xl border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 transition-colors px-4 py-3 text-left disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {icon ? (
                    // icon is often a data: URL
                    <img src={icon} alt="" className="h-7 w-7 rounded-full bg-black" />
                  ) : (
                    <div className="h-7 w-7 rounded-full border border-zinc-800 bg-black" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{String(name)}</div>
                    <div className="text-xs text-zinc-500">Tap to connect</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

