'use client';

import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { trpcClient } from "@/src/utils/trpcClient";

const dispatchSyncedEvent = (detail?: { user?: unknown | null }) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("privy-session-bridged", { detail }));
};

const hasCsrfError = (error: unknown): boolean => {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  return raw.toUpperCase().includes("CSRF_TOKEN_INVALID");
};

const refreshCsrfCookie = async () => {
  await fetch("/api/auth/csrf", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });
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
          let response: Awaited<ReturnType<typeof trpcClient.auth.privyLogin.mutate>> | null = null;
          try {
            response = await trpcClient.auth.privyLogin.mutate({ accessToken: token });
          } catch (error) {
            if (!hasCsrfError(error)) throw error;
            await refreshCsrfCookie();
            response = await trpcClient.auth.privyLogin.mutate({ accessToken: token });
          }
          lastAccessTokenRef.current = token;
          dispatchSyncedEvent({ user: response?.user ?? null });
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
        dispatchSyncedEvent({ user: null });
      });
  }, [ready, authenticated, getAccessToken]);

  return null;
}
