'use client';

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// Dynamically import WalletConnectProvider with SSR disabled
// This ensures createAppKit is only called on the client side
const WalletConnectProvider = dynamic(
  () => import("./WalletConnectProvider").then((mod) => ({ default: mod.WalletConnectProvider })),
  { ssr: false }
);

interface ClientWalletConnectProviderProps {
  children: ReactNode;
}

export default function ClientWalletConnectProvider({ children }: ClientWalletConnectProviderProps) {
  return <WalletConnectProvider>{children}</WalletConnectProvider>;
}
