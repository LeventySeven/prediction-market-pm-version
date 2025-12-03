
import React, { useState } from 'react';
import Button from './Button';
import { BarChart2, DollarSign, Wallet } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(1);

  if (!isOpen) return null;

  const content = [
    {
      title: "Выберите рынок",
      desc: "Покупайте акции 'Да' или 'Нет' в зависимости от вашего прогноза. Покупка акций — это как ставка на исход. Коэффициенты меняются в реальном времени.",
      icon: <BarChart2 size={40} className="text-[#BEFF1D]" />
    },
    {
      title: "Сделайте ставку",
      desc: "Пополните свой счет (Crypto/USDC) — и вы готовы делать ставки. Никаких лимитов и скрытых комиссий.",
      icon: <Wallet size={40} className="text-[#BEFF1D]" />
    },
    {
      title: "Получайте прибыль",
      desc: "Продавайте свои акции 'Да' или 'Нет' в любое время или ждите окончания рынка, чтобы обменять выигрышные акции на $1 за каждую.",
      icon: <DollarSign size={40} className="text-[#BEFF1D]" />
    }
  ];

  const current = content[step - 1];

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm"></div>
      
      <div className="relative bg-[#0f0f0f] border border-[#222] w-full max-w-md rounded-xl p-8 shadow-2xl flex flex-col items-center text-center animate-fade-in">
        {/* Progress Dots */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map((i) => (
            <div 
              key={i} 
              className={`h-1 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-[#BEFF1D]' : i < step ? 'w-2 bg-[#BEFF1D]' : 'w-2 bg-neutral-800'
              }`}
            />
          ))}
        </div>

        {/* Icon Circle */}
        <div className="w-20 h-20 rounded-2xl bg-[#BEFF1D]/5 flex items-center justify-center mb-6 border border-[#BEFF1D]/10">
          {current.icon}
        </div>

        <h2 className="text-xl font-bold text-white mb-3">{current.title}</h2>
        <p className="text-neutral-400 mb-8 leading-relaxed text-sm">
          {current.desc}
        </p>

        <Button 
          onClick={handleNext} 
          fullWidth 
          size="md"
        >
          {step === 3 ? 'Начать торговать' : 'Далее'}
        </Button>
      </div>
    </div>
  );
};

export default OnboardingModal;
