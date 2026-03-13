import React, { useEffect, useState } from "react";
import { ExternalLink, KeyRound, X } from "lucide-react";
import Button from "./Button";

interface LimitlessCredentialsModalProps {
  isOpen: boolean;
  lang: "RU" | "EN";
  initialBearerToken?: string;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: { bearerToken: string }) => Promise<void> | void;
  onClear?: () => void;
}

const LimitlessCredentialsModal: React.FC<LimitlessCredentialsModalProps> = ({
  isOpen,
  lang,
  initialBearerToken = "",
  error = null,
  onClose,
  onSubmit,
  onClear,
}) => {
  const [bearerToken, setBearerToken] = useState(initialBearerToken);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setBearerToken(initialBearerToken);
    setSubmitting(false);
  }, [initialBearerToken, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const nextBearerToken = bearerToken.trim();
    if (!nextBearerToken) return;
    setSubmitting(true);
    try {
      await onSubmit({ bearerToken: nextBearerToken });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-zinc-900 bg-black shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(190,255,29,0.14),transparent_65%)]" />

        <div className="relative p-6 sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[rgba(190,255,29,0.22)] bg-[rgba(190,255,29,0.08)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[rgba(190,255,29,0.92)]">
                <KeyRound size={12} />
                <span>{lang === "RU" ? "Limitless Auth" : "Limitless Auth"}</span>
              </div>
              <h2 className="text-xl font-semibold leading-tight text-zinc-100 sm:text-2xl">
                {lang === "RU" ? "Подключите Limitless Bearer token" : "Connect a Limitless Bearer token"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {lang === "RU"
                  ? "Bearer token сохраняется только в этом браузере. Ордер подписывается вашим кошельком локально, а сервер только ретранслирует уже подписанный запрос."
                  : "The Bearer token stays in this browser only. Your wallet signs the order locally, and the server only relays the signed request."}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-900 bg-zinc-950/60 text-zinc-300 transition-colors hover:bg-zinc-950 hover:text-white"
              aria-label={lang === "RU" ? "Закрыть" : "Close"}
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-900 bg-zinc-950/50 p-4 text-sm leading-relaxed text-zinc-400">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                {lang === "RU" ? "Где взять данные" : "Where to get them"}
              </div>
              <p>
                {lang === "RU"
                  ? "Используйте Limitless session / Bearer token для отправки ордера. Токен не хранится на сервере."
                  : "Use a Limitless session / Bearer token for order relay. The token is never stored on the server."}
              </p>
              <a
                href="https://docs.limitless.exchange/api-reference/trading/create-order"
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-zinc-100 underline decoration-zinc-700 underline-offset-4 transition-colors hover:text-white"
              >
                <span>{lang === "RU" ? "Открыть официальную документацию" : "Open official docs"}</span>
                <ExternalLink size={14} />
              </a>
            </div>

            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                {lang === "RU" ? "Bearer token" : "Bearer token"}
              </div>
              <div className="relative">
                <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                <textarea
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  placeholder="eyJhbGciOi..."
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  rows={4}
                  className="min-h-[116px] w-full rounded-[22px] border border-zinc-900 bg-zinc-950 pl-10 pr-4 pt-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                />
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <Button
              onClick={handleSubmit}
              fullWidth
              disabled={submitting || !bearerToken.trim()}
              className="h-11 rounded-full"
            >
              {submitting
                ? lang === "RU"
                  ? "Сохраняем..."
                  : "Saving..."
                : lang === "RU"
                  ? "Сохранить и продолжить"
                  : "Save and continue"}
            </Button>
            {onClear ? (
              <Button
                onClick={onClear}
                type="button"
                fullWidth
                variant="outline"
                className="h-11 rounded-full border-zinc-900 bg-zinc-950/30 hover:bg-zinc-950/60"
              >
                {lang === "RU" ? "Удалить локальные данные" : "Forget local credentials"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LimitlessCredentialsModal;
