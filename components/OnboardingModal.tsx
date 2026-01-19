
import React, { useState } from 'react';
import Button from './Button';
import { Globe } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'RU' | 'EN';
  onToggleLang: () => void;
}

const contentByLang = {
  RU: [
    {
      title: "Сформулируй вопрос",
      desc: "«Если можешь спросить — можешь создать рынок.»",
    },
    {
      title: "Задай исходы",
      desc: "Чёткие исходы = больше ставок = больше объёма.",
    },
    {
      title: "Пригласи людей",
      desc: "Приватно с друзьями или открыто для всех.",
    },
    {
      title: "Зарабатывай автоматически",
      desc: "Ты получаешь долю объёма — без управления и без контроля вручную.",
    },
  ],
  EN: [
    {
      title: "Name the Question",
      desc: "“If you can ask it, you can market it.”",
    },
    {
      title: "Set the Outcomes",
      desc: "Clear outcomes = more bets = more volume.",
    },
    {
      title: "Invite people",
      desc: "Private with friends or open to everyone.",
    },
    {
      title: "Earn Automatically",
      desc: "You earn a share of the volume—no managing, no chasing.",
    },
  ],
} as const;

const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose, lang, onToggleLang }) => {
  const [step, setStep] = useState(1);
  const [demoPick, setDemoPick] = useState<'YES' | 'NO' | null>(null);

  if (!isOpen) return null;

  const current = contentByLang[lang][step - 1];

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      onClose();
      // Reset step for next time opened
      setTimeout(() => setStep(1), 300);
    }
  };

  // Render Visuals based on Step
  const renderVisual = () => {
    switch (step) {
        case 1: // Name the question
          return (
            <div className="w-full border border-neutral-800 rounded-xl p-4 mb-6 bg-black">
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                {lang === "RU" ? "Вопрос" : "Question"}
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-3">
                <div className="text-sm font-semibold text-white leading-snug">
                  {lang === "RU" ? "Сможет ли Bitcoin упасть до конца месяца?" : "Will Bitcoin crash by the end of the month?"}
                </div>
                <div className="mt-2 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full w-[55%] bg-[rgba(190,255,29,1)]" />
                </div>
              </div>
              <div className="mt-3 text-xs text-neutral-500">
                {lang === "RU" ? "Коротко, ясно и измеримо." : "Short, clear, measurable."}
              </div>
            </div>
          );
        case 2: // Set outcomes (interactive)
          return (
            <div className="w-full mb-6">
              <div className="w-full flex gap-3">
                <button
                  type="button"
                  onClick={() => setDemoPick("YES")}
                  className={`flex-1 p-3 rounded-lg border flex flex-col items-center justify-center transition-all duration-200 active:scale-[0.98] ${
                    demoPick === "YES"
                      ? "bg-[rgba(190,255,29,1)] border-[rgba(190,255,29,1)] text-black shadow-[0_0_22px_rgba(190,255,29,0.22)]"
                      : "bg-black border-neutral-800 text-white hover:border-neutral-600"
                  }`}
                >
                  <span className="text-lg font-bold mb-1">{lang === "RU" ? "ДА" : "YES"}</span>
                  <span className={`text-xs font-mono ${demoPick === "YES" ? "text-black/70" : "text-neutral-400"}`}>Outcome A</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDemoPick("NO")}
                  className={`flex-1 p-3 rounded-lg border flex flex-col items-center justify-center transition-all duration-200 active:scale-[0.98] ${
                    demoPick === "NO"
                      ? "bg-[rgba(245,68,166,1)] border-[rgba(245,68,166,1)] text-white shadow-[0_0_22px_rgba(245,68,166,0.18)]"
                      : "bg-black border-neutral-800 text-white hover:border-neutral-600"
                  }`}
                >
                  <span className="text-lg font-bold mb-1">{lang === "RU" ? "НЕТ" : "NO"}</span>
                  <span className={`text-xs font-mono ${demoPick === "NO" ? "text-white/80" : "text-neutral-400"}`}>Outcome B</span>
                </button>
              </div>
              <div className="mt-3 text-xs text-neutral-500">
                {lang === "RU" ? "Чёткие варианты ответа повышают доверие и объём." : "Clear outcomes increase confidence and volume."}
              </div>
            </div>
          );
        case 3: // Invite people
          return (
            <div className="w-full border border-neutral-800 rounded-xl p-4 mb-6 bg-black">
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-3">
                {lang === "RU" ? "Доступ" : "Access"}
              </div>
              <div className="mt-3 text-xs text-neutral-500">
                {lang === "RU" ? "Поделитесь с друзьями или откройте для всех." : "Share with friends or open to everyone."}
              </div>
            </div>
          );
        case 4: // Earn automatically
          return (
            <div className="w-full bg-neutral-900/30 border border-neutral-800 rounded-lg p-4 mb-6 relative">
              <div className="absolute -top-2 -right-2 bg-[rgba(190,255,29,1)] text-black text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                {lang === "RU" ? "Доход" : "Earnings"}
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-neutral-400">{lang === "RU" ? "Объём" : "Volume"}</span>
                <span className="text-sm text-white font-mono">$2,430.00</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-neutral-800">
                <span className="text-xs text-neutral-400">{lang === "RU" ? "Доля создателя" : "Creator share"}</span>
                <span className="text-xl font-bold text-[rgba(190,255,29,1)] font-mono">$48.60</span>
              </div>
              <div className="mt-2 text-right">
                <span className="text-[10px] text-[rgba(190,255,29,1)] font-bold bg-[rgba(190,255,29,0.12)] px-1.5 py-0.5 rounded">
                  {lang === "RU" ? "Автоматически" : "Automatic"}
                </span>
              </div>
            </div>
          );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={onClose}></div>
      
      <div className="relative w-full max-w-sm animate-fade-in">
        {/* Subtle glow under the modal */}
        <div className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 h-20 w-[92%] rounded-full blur-2xl opacity-70 bg-[radial-gradient(closest-side,rgba(190,255,29,0.18),transparent_70%),radial-gradient(closest-side,rgba(245,68,166,0.18),transparent_70%)]" />

        <div className="relative bg-black border border-neutral-900 w-full rounded-2xl p-8 shadow-2xl flex flex-col items-center text-center">
        
        {/* Language Toggle in Modal */}
        <button 
            onClick={onToggleLang}
            className="absolute top-6 right-6 flex items-center gap-1.5 px-2 py-1 rounded border border-neutral-800 hover:border-neutral-600 text-[10px] font-bold text-neutral-500 hover:text-white transition-colors transition-transform active:scale-95 uppercase tracking-widest"
        >
            <Globe size={10} />
            {lang}
        </button>

        {/* Progress Dots */}
        <div className="flex gap-3 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div 
              key={i} 
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-white' : i < step ? 'w-2 bg-neutral-600' : 'w-2 bg-neutral-900'
              }`}
            />
          ))}
        </div>

        {/* Dynamic Visual Content */}
        <div className="w-full flex items-center justify-center min-h-[140px]">
             {renderVisual()}
        </div>

        <h2 className="text-lg font-bold text-white mb-4 tracking-wide uppercase">{current.title}</h2>
        <p className="text-neutral-500 mb-10 leading-relaxed text-sm max-w-[280px]">
          {current.desc}
        </p>

        <Button 
          onClick={handleNext} 
          fullWidth 
          size="md"
        >
          {step === 4 ? (lang === 'RU' ? 'Начать' : 'Start') : (lang === 'RU' ? 'Далее' : 'Next')}
        </Button>

        {/* Social links (bottom of guide) */}
        <div className="w-full mt-5 pt-4 border-t border-neutral-900/60">
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3">
            {lang === 'RU' ? 'Ссылки' : 'Links'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a
              href="https://x.com/yallayallaio"
              target="_blank"
              rel="noreferrer noopener"
              className="h-10 rounded-full border border-neutral-800 bg-zinc-950/40 hover:bg-zinc-950/70 hover:border-neutral-600 text-xs font-semibold text-white inline-flex items-center justify-center transition-colors transition-transform active:scale-[0.98]"
            >
              Twitter (X)
            </a>
            <a
              href="https://t.me/yalla_predict"
              target="_blank"
              rel="noreferrer noopener"
              className="h-10 rounded-full border border-neutral-800 bg-zinc-950/40 hover:bg-zinc-950/70 hover:border-neutral-600 text-xs font-semibold text-white inline-flex items-center justify-center transition-colors transition-transform active:scale-[0.98]"
            >
              Telegram
            </a>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
