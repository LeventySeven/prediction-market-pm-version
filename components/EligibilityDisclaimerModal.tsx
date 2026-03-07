import React from "react";
import { ExternalLink, ShieldCheck, X } from "lucide-react";
import Button from "./Button";

interface EligibilityDisclaimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: "RU" | "EN";
}

const EligibilityDisclaimerModal: React.FC<EligibilityDisclaimerModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-xl overflow-hidden rounded-[28px] border border-zinc-900 bg-black shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(245,68,166,0.18),transparent_65%)]" />

        <div className="relative p-6 sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[rgba(245,68,166,0.28)] bg-[rgba(245,68,166,0.10)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[rgba(245,68,166,0.92)]">
                <ShieldCheck size={12} />
                <span>{lang === "RU" ? "Важное уведомление" : "Important notice"}</span>
              </div>
              <h2 className="max-w-lg text-xl font-semibold leading-tight text-zinc-100 sm:text-2xl">
                Geographic Eligibility Disclaimer
              </h2>
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

          <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
            <p>
              I hereby declare and confirm that I am not located in, accessing from, or a resident of
              any country or region where prediction markets are prohibited, restricted, or otherwise
              unlawful under applicable local, national, or international laws and regulations.
            </p>

            <div className="rounded-2xl border border-zinc-900 bg-zinc-950/50 p-4">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                {lang === "RU" ? "Официальная ссылка Polymarket" : "Official Polymarket link"}
              </div>
              <a
                href="https://docs.polymarket.com/api-reference/geoblock"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-100 underline decoration-zinc-700 underline-offset-4 transition-colors hover:text-white"
              >
                <span>Restricted locations list</span>
                <ExternalLink size={14} />
              </a>
            </div>
          </div>

          <div className="mt-6">
            <Button onClick={onClose} fullWidth>
              {lang === "RU" ? "Понятно" : "I understand"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EligibilityDisclaimerModal;
