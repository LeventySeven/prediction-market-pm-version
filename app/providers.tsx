'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { WalletAdapterNetwork, type Adapter } from '@solana/wallet-adapter-base';
import { clusterApiUrl } from '@solana/web3.js';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import {
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-adapter-mobile';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const solanaCluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet').toLowerCase();
  const network =
    solanaCluster === 'mainnet-beta'
      ? WalletAdapterNetwork.Mainnet
      : solanaCluster === 'testnet'
        ? WalletAdapterNetwork.Testnet
        : WalletAdapterNetwork.Devnet;

  const endpoint = useMemo(() => {
    const explicit = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    if (explicit && explicit.trim().length > 0) {
      const trimmed = explicit.trim();
      // `@solana/web3.js` throws during (pre)render if the endpoint doesn't start with http(s).
      return trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`;
    }
    return clusterApiUrl(network);
  }, [network]);

  const wallets = useMemo(() => {
    // Mobile deep linking (Anza docs): Solana Mobile Wallet Adapter opens installed wallets.
    // On desktop it stays available but is typically unused.
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    // MWA adapter only supports Mainnet/Devnet (treat Testnet as Devnet).
    const mwaCluster = network === WalletAdapterNetwork.Mainnet ? WalletAdapterNetwork.Mainnet : WalletAdapterNetwork.Devnet;
    const list: Adapter[] = [
      new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: {
          name: 'Yalla Market',
          uri: appUrl,
          icon: '/pink.svg',
        },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        cluster: mwaCluster,
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      }),
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ];

    return list;
  }, [network]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={true}>
        <WalletModalProvider>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
