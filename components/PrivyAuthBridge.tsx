'use client';

import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { trpcClient } from "@/src/utils/trpcClient";

const dispatchSyncedEvent = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("privy-session-bridged"));
};

export default function PrivyAuthBridge() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const lastAccessTokenRef = useRef<string | null>(null);
  const clearedRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (authenticated) {
      clearedRef.current = false;
      void (async () => {
        try {
          const token = await getAccessToken();
          if (!token || token === lastAccessTokenRef.current) return;
          await trpcClient.auth.privyLogin.mutate({ accessToken: token });
          lastAccessTokenRef.current = token;
          dispatchSyncedEvent();
        } catch (err) {
          // Avoid noisy logs with secrets/token values.
          console.warn("privy bridge login failed");
        }
      })();
      return;
    }

    lastAccessTokenRef.current = null;
    if (clearedRef.current) return;
    clearedRef.current = true;
    void trpcClient.auth.privyLogout
      .mutate()
      .catch(() => undefined)
      .finally(() => {
        dispatchSyncedEvent();
      });
  }, [ready, authenticated, getAccessToken]);

  return null;
}
