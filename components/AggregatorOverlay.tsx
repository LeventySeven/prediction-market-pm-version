'use client';

import { ArrowLeft } from "lucide-react";

const AGGREGATOR_URL = process.env.NEXT_PUBLIC_AGGREGATOR_URL || "https://www.yallamarket.io/";

interface AggregatorOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  lang: "RU" | "EN";
}

export default function AggregatorOverlay({ isOpen, onClose, lang }: AggregatorOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
          aria-label={lang === "RU" ? "Назад" : "Back"}
        >
          <ArrowLeft size={18} />
        </button>
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Pre Markets
        </span>
      </div>
      <iframe
        src={AGGREGATOR_URL}
        className="flex-1 w-full border-0"
        allow="clipboard-write"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation-by-user-activation"
        title="Pre Markets Aggregator"
      />
    </div>
  );
}
