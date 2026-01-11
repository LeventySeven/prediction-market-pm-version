import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, arbitrum, base, polygon } from '@reown/appkit/networks';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

if (!projectId) {
  throw new Error('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not defined');
}

const metadata = {
  name: 'Yalla Market',
  description: 'Prediction market demo',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://yalla-market.com',
  icons: [],
};

const networks = [mainnet, arbitrum, base, polygon];

const wagmiAdapter = new WagmiAdapter({
  ssr: false,
  projectId,
  networks,
});

// CRITICAL: Initialize here, but only on the client
let appKitModal: any = null;

export function initializeAppKit() {
  if (appKitModal) return appKitModal;

  appKitModal = createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks,
    metadata,
    features: {
      analytics: false,
      email: false,
      socials: [],
    },
    themeMode: 'dark',
  } as any);

  return appKitModal;
}

export { wagmiAdapter };
