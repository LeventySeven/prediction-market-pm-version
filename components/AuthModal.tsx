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
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      <div className="relative bg-black border border-neutral-800 w-full max-w-md rounded-2xl p-8 shadow-2xl animate-fade-in-up">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-neutral-600 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold text-white mb-2 tracking-wide">
          {step === 'SELECT' ? 'Enter Nothing' : 'Email Login'}
        </h2>
        <p className="text-neutral-500 mb-8 text-xs uppercase tracking-wider">
           {step === 'SELECT' ? 'Connect to start trading.' : 'We will send a magic link.'}
        </p>

        {step === 'SELECT' ? (
            <div className="space-y-3">
            <button 
                onClick={handleLogin}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-600 transition-all group"
            >
                <div className="flex items-center gap-4">
                <div className="bg-white/5 p-2 rounded-lg text-white">
                    <Wallet size={18} />
                </div>
                <span className="font-medium text-sm text-neutral-300 group-hover:text-white transition-colors">Crypto Wallet</span>
                </div>
                <ArrowRight size={16} className="text-neutral-600 group-hover:text-white group-hover:translate-x-1 transition-all" />
            </button>

            <button 
                onClick={() => setStep('EMAIL')}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-600 transition-all group"
            >
                <div className="flex items-center gap-4">
                <div className="bg-white/5 p-2 rounded-lg text-white">
                    <Mail size={18} />
                </div>
                <span className="font-medium text-sm text-neutral-300 group-hover:text-white transition-colors">Email Address</span>
                </div>
                <ArrowRight size={16} className="text-neutral-600 group-hover:text-white group-hover:translate-x-1 transition-all" />
            </button>
            </div>
        ) : (
            <div className="space-y-6">
                <div>
                    <label className="block text-[10px] font-bold text-neutral-500 mb-2 uppercase tracking-widest">Email</label>
                    <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full bg-black border border-neutral-800 rounded-lg p-3 text-white focus:border-neutral-600 focus:outline-none transition-colors placeholder:text-neutral-800"
                    />
                </div>
                <Button fullWidth onClick={handleLogin}>
                    Continue
                </Button>
                <button 
                    onClick={() => setStep('SELECT')}
                    className="w-full text-center text-xs text-neutral-600 hover:text-white uppercase tracking-wider"
                >
                    Back
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;