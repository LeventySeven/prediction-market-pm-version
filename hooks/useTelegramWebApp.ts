import { useEffect, useState } from "react";

type TelegramHookState = {
  webApp: TelegramWebApp | null;
  themeParams: TelegramWebAppThemeParams | null;
  isTelegram: boolean;
};

const defaultState: TelegramHookState = {
  webApp: null,
  themeParams: null,
  isTelegram: false,
};

/**
 * Lightweight initializer for Telegram Mini App runtime.
 * Keeps theme params in sync and calls ready/expand when available.
 */
const useTelegramWebApp = (): TelegramHookState => {
  const [state, setState] = useState<TelegramHookState>(defaultState);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      console.warn("Telegram WebApp is not available. Are you inside Telegram?");
      return;
    }

    const unsafe = tg.initDataUnsafe as any;
    console.log("Telegram initDataUnsafe:", unsafe);
    console.log("Telegram user:", unsafe?.user);

    const applyTelegramState = () =>
      setState({
        webApp: tg,
        themeParams: { ...tg.themeParams },
        isTelegram: true,
      });

    applyTelegramState();

    try {
      tg.ready();
      tg.expand?.();
    } catch {
      // Telegram API not available or failed; no-op.
    }

    const handleTheme = () => applyTelegramState();
    tg.onEvent?.("themeChanged", handleTheme);

    return () => {
      tg.offEvent?.("themeChanged", handleTheme);
    };
  }, []);

  return state;
};

export default useTelegramWebApp;

