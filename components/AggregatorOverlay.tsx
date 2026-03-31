'use client';

import { useState } from "react";
import { Loader2 } from "lucide-react";

const AGGREGATOR_URL = process.env.NEXT_PUBLIC_AGGREGATOR_URL || "https://www.yallamarket.io/";

interface AggregatorOverlayProps {
  isOpen: boolean;
}

export default function AggregatorOverlay({ isOpen }: AggregatorOverlayProps) {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bottom-16 z-40 flex flex-col bg-black">
      <div className="relative flex-1">
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <Loader2 size={32} className="animate-spin text-zinc-500" />
          </div>
        )}
        <iframe
          src={AGGREGATOR_URL}
          className="h-full w-full border-0"
          allow="clipboard-write"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation-by-user-activation"
          title="Pre Markets Aggregator"
          onLoad={() => setIframeLoaded(true)}
        />
      </div>
    </div>
  );
}
