import React, { useState } from 'react';
import { X, Mail, Wallet, ArrowRight } from 'lucide-react';
import Button from './Button';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLogin }) => {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'SELECT' | 'EMAIL'>('SELECT');

  if (!isOpen) return null;

  const handleLogin = () => {
    // Simulate login
    setTimeout(() => {
        onLogin();
        onClose();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      <div className="relative bg-neutral-900 border border-neutral-700 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in-up">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white"
        >
          <X size={24} />
        </button>

        <h2 className="text-2xl font-bold text-white mb-2">
          {step === 'SELECT' ? 'Вход в Pravda Market' : 'Войти через Email'}
        </h2>
        <p className="text-neutral-400 mb-6 text-sm">
           {step === 'SELECT' ? 'Подключите кошелек или используйте почту, чтобы начать делать ставки.' : 'Мы отправим магическую ссылку для входа.'}
        </p>

        {step === 'SELECT' ? (
            <div className="space-y-3">
            <button 
                onClick={handleLogin}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-[#BEFF1D] transition-all group"
            >
                <div className="flex items-center gap-3">
                <div className="bg-[#BEFF1D]/20 p-2 rounded-lg text-[#BEFF1D]">
                    <Wallet size={20} />
                </div>
                <span className="font-medium text-white">Metamask / Crypto Wallet</span>
                </div>
                <ArrowRight size={18} className="text-neutral-500 group-hover:text-[#BEFF1D] group-hover:translate-x-1 transition-all" />
            </button>

            <button 
                onClick={() => setStep('EMAIL')}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-white transition-all group"
            >
                <div className="flex items-center gap-3">
                <div className="bg-white/10 p-2 rounded-lg text-white">
                    <Mail size={20} />
                </div>
                <span className="font-medium text-white">Email Address</span>
                </div>
                <ArrowRight size={18} className="text-neutral-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
            </button>
            </div>
        ) : (
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">Email</label>
                    <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ivan@example.com"
                        className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-[#BEFF1D] focus:outline-none transition-colors"
                    />
                </div>
                <Button fullWidth onClick={handleLogin}>
                    Продолжить
                </Button>
                <button 
                    onClick={() => setStep('SELECT')}
                    className="w-full text-center text-sm text-neutral-500 hover:text-white"
                >
                    Назад к выбору
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;