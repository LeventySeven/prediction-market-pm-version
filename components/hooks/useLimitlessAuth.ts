'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LimitlessStoredAuth = {
  bearerToken: string;
  ownerId: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LIMITLESS_AUTH_STORAGE_KEY = "limitlessTradingAuth_v3";

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

const normalizeLimitlessStoredAuth = (value: unknown): LimitlessStoredAuth | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as { bearerToken?: unknown; ownerId?: unknown };
  const bearerToken = typeof rec.bearerToken === "string" ? rec.bearerToken.trim() : "";
  const ownerId =
    typeof rec.ownerId === "number"
      ? rec.ownerId
      : typeof rec.ownerId === "string"
        ? Number.parseInt(rec.ownerId, 10)
        : Number.NaN;
  if (!bearerToken || !Number.isInteger(ownerId) || ownerId <= 0) return null;
  return { bearerToken, ownerId };
};

const readStoredLimitlessAuth = (): LimitlessStoredAuth | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LIMITLESS_AUTH_STORAGE_KEY);
    if (!raw) return null;
    return normalizeLimitlessStoredAuth(JSON.parse(raw));
  } catch {
    return null;
  }
};

const writeStoredLimitlessAuth = (value: LimitlessStoredAuth) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(LIMITLESS_AUTH_STORAGE_KEY, JSON.stringify(value));
};

const clearStoredLimitlessAuth = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LIMITLESS_AUTH_STORAGE_KEY);
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLimitlessAuth() {
  const limitlessAuthPromptResolverRef = useRef<((value: LimitlessStoredAuth | null) => void) | null>(null);

  const [limitlessStoredAuth, setLimitlessStoredAuth] = useState<LimitlessStoredAuth | null>(() =>
    readStoredLimitlessAuth()
  );
  const [limitlessCredentialsOpen, setLimitlessCredentialsOpen] = useState(false);
  const [limitlessCredentialsError, setLimitlessCredentialsError] = useState<string | null>(null);

  const resolveLimitlessCredentialsPrompt = useCallback((value: LimitlessStoredAuth | null) => {
    const resolver = limitlessAuthPromptResolverRef.current;
    limitlessAuthPromptResolverRef.current = null;
    if (resolver) resolver(value);
  }, []);

  const closeLimitlessCredentialsModal = useCallback(() => {
    setLimitlessCredentialsOpen(false);
    setLimitlessCredentialsError(null);
    resolveLimitlessCredentialsPrompt(null);
  }, [resolveLimitlessCredentialsPrompt]);

  const promptForLimitlessCredentials = useCallback(async () => {
    const stored = readStoredLimitlessAuth();
    if (stored) {
      setLimitlessStoredAuth(stored);
      return stored;
    }
    setLimitlessCredentialsError(null);
    setLimitlessCredentialsOpen(true);
    return await new Promise<LimitlessStoredAuth | null>((resolve) => {
      limitlessAuthPromptResolverRef.current = resolve;
    });
  }, []);

  const handleSaveLimitlessCredentials = useCallback(
    async (payload: { bearerToken: string; ownerId: number }) => {
      const nextValue: LimitlessStoredAuth = {
        bearerToken: payload.bearerToken.trim(),
        ownerId: payload.ownerId,
      };
      writeStoredLimitlessAuth(nextValue);
      setLimitlessStoredAuth(nextValue);
      setLimitlessCredentialsError(null);
      setLimitlessCredentialsOpen(false);
      resolveLimitlessCredentialsPrompt(nextValue);
    },
    [resolveLimitlessCredentialsPrompt]
  );

  const handleClearLimitlessCredentials = useCallback(() => {
    clearStoredLimitlessAuth();
    setLimitlessStoredAuth(null);
    setLimitlessCredentialsError(null);
  }, []);

  // Clean up the resolver on unmount
  useEffect(() => {
    return () => {
      if (limitlessAuthPromptResolverRef.current) {
        limitlessAuthPromptResolverRef.current(null);
        limitlessAuthPromptResolverRef.current = null;
      }
    };
  }, []);

  return {
    limitlessStoredAuth,
    limitlessCredentialsOpen,
    limitlessCredentialsError,
    closeLimitlessCredentialsModal,
    promptForLimitlessCredentials,
    handleSaveLimitlessCredentials,
    handleClearLimitlessCredentials,
  };
}
