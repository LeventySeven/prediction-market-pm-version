
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
      title: "Выбери сторону",
      desc: "Выбери исход, который считаешь вероятным. Цены отражают вероятность события.",
    },
    {
      title: "Выбери исход",
      desc: "Купи акции «Да» или «Нет».",
    },
    {
      title: "Отслеживай итоги",
      desc: "Получай вознаграждение за верное предсказание. Продавай позиции в любой момент или жди окончания события.",
    },
  ],
  EN: [
    {
      title: "Pick a side",
      desc: "Choose the outcome you consider likely. Prices reflect the probability of the event.",
    },
    {
      title: "Choose the outcome",
      desc: "Buy “Yes” or “No” shares.",
    },
    {
      title: "Track the result",
      desc: "Earn if the prediction is correct. Sell at any moment or wait until the event ends.",
    },
  ],
} as const;

const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose, lang, onToggleLang }) => {
  const [step, setStep] = useState(1);

  if (!isOpen) return null;

  const current = contentByLang[lang][step - 1];

  const handleNext = () => {
    if (step < 3) {
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
        case 1: // Probability Graph
            return (
                <div className="w-full bg-black border border-neutral-800 rounded-lg p-4 mb-6 relative overflow-hidden flex flex-col justify-center">
                    <div className="flex justify-between items-end mb-4">
                        <span className="text-3xl font-bold text-[#E50C00]">72%</span>
                        <span className="text-[10px] uppercase text-neutral-500 tracking-widest">{lang === 'RU' ? 'Вероятность' : 'Chance'}</span>
                    </div>
                    {/* Fake Bar */}
                    <div className="w-full h-2 bg-neutral-900 rounded-full flex mb-4">
                        <div className="w-[72%] h-full bg-[#E50C00] shadow-[0_0_10px_rgba(229,12,0,0.35)]"></div>
                        <div className="w-[28%] h-full bg-white/10"></div>
                    </div>
                     <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                            <span className="text-xl font-extrabold text-white tracking-wide">{lang === 'RU' ? 'ДА' : 'YES'}</span>
                            <span className="text-xs text-neutral-500 font-mono">$0.72</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-xl font-extrabold text-white tracking-wide">{lang === 'RU' ? 'НЕТ' : 'NO'}</span>
                             <span className="text-xs text-neutral-500 font-mono">$0.28</span>
                        </div>
                    </div>
                </div>
            );
        case 2: // Buttons Animation
            return (
                <div className="w-full flex gap-3 mb-6">
                    <div
                      className="flex-1 p-3 rounded-lg border flex flex-col items-center justify-center bg-[#E50C00] border-[#E50C00] shadow-[0_0_20px_rgba(229,12,0,0.25)] animate-pulse"
                      style={{ animationDuration: '1.5s' }}
                    >
                        <span className="text-lg font-bold mb-1 text-white">{lang === 'RU' ? 'ДА' : 'YES'}</span>
                        <span className="text-xs text-white">$0.72</span>
                    </div>
                    <div
                      className="flex-1 p-3 rounded-lg border flex flex-col items-center justify-center bg-[#E50C00] border-[#E50C00] shadow-[0_0_20px_rgba(229,12,0,0.25)] animate-pulse"
                      style={{ animationDuration: '1.5s', animationDelay: '750ms' }}
                    >
                        <span className="text-lg font-bold mb-1 text-white">{lang === 'RU' ? 'НЕТ' : 'NO'}</span>
                        <span className="text-xs text-white">$0.28</span>
                    </div>
                </div>
            );
        case 3: // Profit Card
            return (
                <div className="w-full bg-neutral-900/30 border border-neutral-800 rounded-lg p-4 mb-6 relative">
                     <div className="absolute -top-2 -right-2 bg-[#E50C00] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        {lang === 'RU' ? 'Победа' : 'Win'}
                     </div>
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-neutral-400">{lang === 'RU' ? 'Вложено' : 'Invested'}</span>
                        <span className="text-sm text-white font-mono">$100.00</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-neutral-800">
                        <span className="text-xs text-neutral-400">{lang === 'RU' ? 'Выигрыш' : 'Redeem'}</span>
                        <span className="text-xl font-bold text-[#E50C00] font-mono">$138.00</span>
                    </div>
                     <div className="mt-2 text-right">
                        <span className="text-[10px] text-[#E50C00] font-bold bg-[rgba(229,12,0,0.12)] px-1.5 py-0.5 rounded">
                            +38% {lang === 'RU' ? 'ПРИБЫЛЬ' : 'PROFIT'}
                        </span>
                    </div>
                </div>
            );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={onClose}></div>
      
      <div className="relative bg-black border border-neutral-900 w-full max-w-sm rounded-2xl p-8 shadow-2xl flex flex-col items-center text-center animate-fade-in">
        
        {/* Language Toggle in Modal */}
        <button 
            onClick={onToggleLang}
            className="absolute top-6 right-6 flex items-center gap-1.5 px-2 py-1 rounded border border-neutral-800 hover:border-neutral-600 text-[10px] font-bold text-neutral-500 hover:text-white transition-colors uppercase tracking-widest"
        >
            <Globe size={10} />
            {lang}
        </button>

        {/* Progress Dots */}
        <div className="flex gap-3 mb-8">
          {[1, 2, 3].map((i) => (
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
          {step === 3 ? (lang === 'RU' ? 'Начать' : 'Start') : (lang === 'RU' ? 'Далее' : 'Next')}
        </Button>
      </div>
    </div>
  );
};

export default OnboardingModal;
