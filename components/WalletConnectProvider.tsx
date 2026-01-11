'use client';

import React, { FC, ReactNode, useMemo, useRef } from "react";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { WagmiProvider } from "wagmi";
import { mainnet, arbitrum, base, polygon } from "@reown/appkit/networks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface WalletConnectProviderProps {
  children: ReactNode;
}

// Initialize QueryClient for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

// Get project ID from environment variable
// Users need to get this from https://dashboard.reown.com
const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

const networks = [mainnet, arbitrum, base, polygon];

// Global singleton to ensure createAppKit is only called once
let appKitInitialized = false;
let globalWagmiAdapter: WagmiAdapter | null = null;

export const WalletConnectProvider: FC<WalletConnectProviderProps> = ({ children }) => {
  const initRef = useRef(false);

  // Initialize AppKit synchronously on first render (client-side only)
  // This MUST run before any children render to ensure createAppKit is called first
  const wagmiAdapter = useMemo(() => {
    // Only initialize once
    if (initRef.current || appKitInitialized) {
      return globalWagmiAdapter;
    }

    if (typeof window === 'undefined' || !PROJECT_ID) {
      return null;
    }

    try {
      // Create Wagmi adapter
      const adapter = new WagmiAdapter({
        projectId: PROJECT_ID,
        networks,
        ssr: false,
      });

      // Initialize AppKit (only once, globally, synchronously)
      // This MUST be called before any hooks like useAppKit are used
      createAppKit({
        adapters: [adapter],
        networks,
        projectId: PROJECT_ID,
        metadata: {
          name: 'Yalla Market',
          description: 'Prediction market demo',
          url: window.location.origin,
          icons: [],
        },
        features: {
          analytics: false,
          email: false,
          socials: [],
        },
        themeMode: 'dark',
      } as any); // Type assertion to work around version compatibility issues

      // Mark as initialized
      initRef.current = true;
      appKitInitialized = true;
      globalWagmiAdapter = adapter;

      return adapter;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to initialize WalletConnect AppKit:', error);
      }
      return null;
    }
  }, []);

  // Don't render providers if no adapter
  if (!wagmiAdapter) {
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
};
