'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { WalletReadyState, WalletNotReadyError } from '@solana/wallet-adapter-base';

type Props = {
  className?: string;
  connectedLabel?: string;
  connectLabel?: string;
  selectLabel?: string;
  connectingLabel?: string;
};

type ConnectError = Error | { message?: string } | string | null | undefined;

const toErrorMessage = (e: ConnectError): string => {
  if (!e) return 'Wallet connection failed';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message || 'Wallet connection failed';
  if (typeof e === 'object' && typeof e.message === 'string') return e.message;
  return 'Wallet connection failed';
};

type TelegramLike = { WebApp?: { openLink?: (url: string) => void } };

function getTelegram(): TelegramLike | null {
  const w = window as unknown as { Telegram?: TelegramLike };
  return w.Telegram ?? null;
}

function withAutoConnectParam(urlToOpen: string): string {
  const u = new URL(urlToOpen);
  u.searchParams.set('walletAutoConnect', 'phantom');
  return u.toString();
}

function openPhantomBrowse(urlToOpen: string) {
  const nextUrl = withAutoConnectParam(urlToOpen);
  const url = encodeURIComponent(nextUrl);
  const ref = encodeURIComponent(window.location.origin);
  const deepLink = `https://phantom.app/ul/browse/${url}?ref=${ref}`;

  // Telegram in-app browser: use their API if available.
  const tg = getTelegram()?.WebApp;
  if (tg?.openLink) {
    tg.openLink(deepLink);
    return;
  }

  window.location.href = deepLink;
}

export default function ConnectSolanaWalletButton({
  className,
  connectedLabel = 'Change wallet',
  connectLabel = 'Connect',
  selectLabel = 'Select Wallet',
  connectingLabel = 'Connecting ...',
}: Props) {
  const { setVisible, visible } = useWalletModal();
  const { wallet, connected, connecting, connect, select } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [pendingConnect, setPendingConnect] = useState(false);

  const label = useMemo(() => {
    if (connecting) return connectingLabel;
    if (connected) return connectedLabel;
    if (wallet) return connectLabel;
    return selectLabel;
  }, [connected, connectedLabel, connectLabel, connecting, connectingLabel, selectLabel, wallet]);

  const onClick = useCallback(() => {
    setError(null);

    if (connected) {
      setVisible(true);
      return;
    }

    // Always show the wallet selection modal first (UX preference).
    setPendingConnect(true);
    // Clear any previously-selected wallet so we don't immediately redirect/connect
    // before the user actually picks one in the modal (Telegram-first UX).
    select(null);
    setVisible(true);
  }, [connected, select, setVisible]);

  // After the user selects a wallet in the modal, immediately proceed to connect/deeplink.
  useEffect(() => {
    if (!pendingConnect) return;
    if (connected) {
      setPendingConnect(false);
      return;
    }
    if (!wallet) {
      // User closed the modal without selecting a wallet.
      if (!visible) setPendingConnect(false);
      return;
    } // wait for selection

    // In Telegram webviews, Phantom typically isn't "Installed" (no injection).
    // When Phantom is selected but not detected, open the dapp in Phantom in-wallet browser.
    if (wallet.adapter.name === 'Phantom' && wallet.readyState === WalletReadyState.NotDetected) {
      setPendingConnect(false);
      openPhantomBrowse(window.location.href);
      return;
    }

    connect()
      .then(() => setPendingConnect(false))
      .catch((e: unknown) => {
        setPendingConnect(false);
        if (e instanceof WalletNotReadyError) {
          setVisible(true);
          return;
        }
        setError(toErrorMessage(e as ConnectError));
      });
  }, [pendingConnect, connected, wallet, visible, connect, setVisible]);

  const displayLabel = pendingConnect && !wallet ? selectLabel : label;

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={connecting || pendingConnect}
        className={className}
      >
        {displayLabel}
      </button>
      {error ? <div className="text-[11px] text-red-300 max-w-[220px] text-right">{error}</div> : null}
    </div>
  );
}

