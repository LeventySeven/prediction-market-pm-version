import React, { useEffect, useState } from "react";
import { ExternalLink, KeyRound, UserRound, X } from "lucide-react";
import Button from "./Button";

interface LimitlessCredentialsModalProps {
  isOpen: boolean;
  lang: "RU" | "EN";
  initialApiKey?: string;
  initialOwnerId?: string;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: { apiKey: string; ownerId: number }) => Promise<void> | void;
  onClear?: () => void;
}

const LimitlessCredentialsModal: React.FC<LimitlessCredentialsModalProps> = ({
  isOpen,
  lang,
  initialApiKey = "",
  initialOwnerId = "",
  error = null,
  onClose,
  onSubmit,
  onClear,
}) => {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [ownerId, setOwnerId] = useState(initialOwnerId);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setApiKey(initialApiKey);
    setOwnerId(initialOwnerId);
    setSubmitting(false);
  }, [initialApiKey, initialOwnerId, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const nextApiKey = apiKey.trim();
    const nextOwnerId = Number(ownerId.trim());
    if (!nextApiKey || !Number.isInteger(nextOwnerId) || nextOwnerId <= 0) return;
    setSubmitting(true);
    try {
      await onSubmit({ apiKey: nextApiKey, ownerId: nextOwnerId });
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
                <span>{lang === "RU" ? "Limitless API" : "Limitless API"}</span>
              </div>
              <h2 className="text-xl font-semibold leading-tight text-zinc-100 sm:text-2xl">
                {lang === "RU" ? "Подключите свой Limitless API key" : "Connect your Limitless API key"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {lang === "RU"
                  ? "Ключ и owner ID сохраняются только в этом браузере. Ордер подписывается вашим кошельком локально, а наш сервер только ретранслирует уже подписанный запрос."
                  : "The key and owner ID stay in this browser only. Your wallet signs the order locally, and our server only relays the signed request."}
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
                  ? "Создайте API key в профиле Limitless и возьмите числовой owner ID своего аккаунта."
                  : "Create an API key in your Limitless profile and copy the numeric owner ID for your account."}
              </p>
              <a
                href="https://docs.limitless.exchange/developers/authentication"
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
                API key
              </div>
              <div className="relative">
                <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="lmts_..."
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-11 w-full rounded-full border border-zinc-900 bg-zinc-950 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Owner ID
              </div>
              <div className="relative">
                <UserRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  placeholder="12345"
                  className="h-11 w-full rounded-full border border-zinc-900 bg-zinc-950 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
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
              disabled={submitting || !apiKey.trim() || !ownerId.trim()}
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
