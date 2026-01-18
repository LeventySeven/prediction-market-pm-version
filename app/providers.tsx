'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { WalletAdapterNetwork, type Adapter } from '@solana/wallet-adapter-base';
import { clusterApiUrl } from '@solana/web3.js';
import { PhantomWalletAdapter, SolflareWalletAdapter, WalletConnectWalletAdapter } from '@solana/wallet-adapter-wallets';

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
    const list: Adapter[] = [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network })];

    const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
    if (wcProjectId && wcProjectId.trim().length > 0) {
      // WalletConnect adapter only supports Mainnet/Devnet (treat Testnet as Devnet).
      const wcNetwork = network === WalletAdapterNetwork.Mainnet ? WalletAdapterNetwork.Mainnet : WalletAdapterNetwork.Devnet;
      const appUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      list.push(
        new WalletConnectWalletAdapter({
          network: wcNetwork,
          options: {
            projectId: wcProjectId.trim(),
            metadata: {
              name: 'Yalla Market',
              description: 'Prediction market',
              url: appUrl,
              icons: [`${appUrl}/pink.svg`],
            },
          },
        })
      );
    }

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
