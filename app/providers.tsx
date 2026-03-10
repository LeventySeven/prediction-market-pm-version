'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { polygon } from 'viem/chains';
import PrivyAuthBridge from '@/components/PrivyAuthBridge';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const isTelegramMiniApp =
    typeof window !== 'undefined' &&
    Boolean(
      (window as Window & {
        Telegram?: {
          WebApp?: unknown;
        };
      }).Telegram?.WebApp
    );

  const privyConfig = useMemo(
    () => ({
      appearance: {
        theme: 'dark' as const,
        accentColor: '#f544a6' as const,
      },
      loginMethods: ['email', 'wallet'] as Array<'email' | 'wallet'>,
      embeddedWallets: {
        ethereum: {
          createOnLogin: 'users-without-wallets' as const,
        },
      },
      externalWallets: {
        disableAllExternalWallets: isTelegramMiniApp,
        walletConnect: {
          enabled: !isTelegramMiniApp,
        },
      },
      defaultChain: polygon,
      supportedChains: [polygon],
    }),
    [isTelegramMiniApp]
  );

  if (!appId) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <PrivyProvider appId={appId} config={privyConfig}>
      <PrivyAuthBridge />
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </PrivyProvider>
  );
}
