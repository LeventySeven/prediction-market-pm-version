'use client';

import React, { FC, ReactNode, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
} from "@solana/wallet-adapter-wallets";

interface SolanaProviderProps {
  children: ReactNode;
}

export const SolanaProvider: FC<SolanaProviderProps> = ({ children }) => {
  // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'
  const network = WalletAdapterNetwork.Devnet;

  // You can also provide a custom RPC endpoint
  const endpoint = useMemo(() => {
    return clusterApiUrl(network);
  }, [network]);

  // Configure wallets - according to official Solana documentation
  // Wallet adapters are safe to create immediately and will detect browser extensions
  // They check for window.phantom, window.solflare on instantiation and when connecting
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TorusWalletAdapter(),
    ],
    [] // Create once - adapters handle extension detection internally
  );

  // Check if we're in a Telegram environment
  const isTelegram = typeof window !== 'undefined' && window.Telegram?.WebApp;

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider 
        wallets={wallets} 
        autoConnect={!isTelegram}
        localStorageKey="solana-wallet-adapter"
        onError={(error) => {
          if (process.env.NODE_ENV === 'development') {
            console.error('Solana Wallet Adapter Error:', error);
          }
        }}
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
