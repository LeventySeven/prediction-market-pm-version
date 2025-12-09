
import React from 'react';
import { User } from '../types';
import { Wallet, ArrowDownLeft, ArrowUpRight, History } from 'lucide-react';
import Button from './Button';

interface WalletPageProps {
  user: User | null;
  onLogin: () => void;
  lang: 'RU' | 'EN';
}

interface Transaction {
    id: string;
    type: 'DEPOSIT' | 'WITHDRAW' | 'WIN' | 'BET';
    amount: number;
    date: string;
    status: 'COMPLETED' | 'PENDING';
}

const MOCK_TRANSACTIONS: Transaction[] = [
    { id: 't1', type: 'WIN', amount: 138.50, date: '2024-10-15', status: 'COMPLETED' },
    { id: 't2', type: 'BET', amount: -50.00, date: '2024-10-14', status: 'COMPLETED' },
    { id: 't3', type: 'DEPOSIT', amount: 1000.00, date: '2024-10-01', status: 'COMPLETED' },
];

const WalletPage: React.FC<WalletPageProps> = ({ user, onLogin, lang }) => {
  if (!user) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center animate-fade-in">
            <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mb-6">
                <Wallet size={32} className="text-neutral-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
                {lang === 'RU' ? 'Кошелек недоступен' : 'Wallet Locked'}
            </h2>
            <p className="text-neutral-500 text-sm mb-8">
                {lang === 'RU' ? 'Войдите, чтобы управлять средствами' : 'Please log in to manage your funds'}
            </p>
            <Button onClick={onLogin}>{lang === 'RU' ? 'Войти' : 'Log In'}</Button>
        </div>
      );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 pb-24 animate-fade-in">
      
      {/* Balance Card */}
      <div className="bg-gradient-to-br from-neutral-900 to-black border border-neutral-800 rounded-2xl p-8 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-32 bg-[#BEFF1D] opacity-[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
        
        <div className="text-center relative z-10">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 block">
                {lang === 'RU' ? 'Текущий баланс' : 'Current Balance'}
            </span>
            <h1 className="text-4xl sm:text-5xl font-mono font-bold text-white mb-8">
                ${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </h1>

            <div className="flex gap-4 justify-center">
                <button className="flex-1 bg-[#BEFF1D] hover:bg-[#a6e612] text-black font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
                    <ArrowDownLeft size={18} />
                    {lang === 'RU' ? 'Пополнить' : 'Deposit'}
                </button>
                <button className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
                    <ArrowUpRight size={18} />
                    {lang === 'RU' ? 'Вывести' : 'Withdraw'}
                </button>
            </div>
        </div>
      </div>

      {/* Transactions */}
      <div>
        <h3 className="flex items-center gap-2 text-xs font-bold text-neutral-500 uppercase tracking-widest mb-6 px-1">
            <History size={14} />
            {lang === 'RU' ? 'История транзакций' : 'Transaction History'}
        </h3>
        
        <div className="space-y-3">
            {MOCK_TRANSACTIONS.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-4 bg-neutral-900/30 border border-neutral-800 rounded-xl">
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.amount > 0 ? 'bg-[#BEFF1D]/10 text-[#BEFF1D]' : 'bg-neutral-800 text-neutral-400'}`}>
                            {tx.type === 'DEPOSIT' && <ArrowDownLeft size={18} />}
                            {tx.type === 'WITHDRAW' && <ArrowUpRight size={18} />}
                            {tx.type === 'WIN' && <Wallet size={18} />}
                            {tx.type === 'BET' && <ArrowUpRight size={18} className="rotate-45"/>}
                        </div>
                        <div>
                            <div className="text-sm font-bold text-white">
                                {tx.type === 'DEPOSIT' && (lang === 'RU' ? 'Пополнение' : 'Deposit')}
                                {tx.type === 'WITHDRAW' && (lang === 'RU' ? 'Вывод' : 'Withdrawal')}
                                {tx.type === 'WIN' && (lang === 'RU' ? 'Выигрыш' : 'Market Win')}
                                {tx.type === 'BET' && (lang === 'RU' ? 'Ставка' : 'Bet Placed')}
                            </div>
                            <div className="text-[10px] text-neutral-600 uppercase tracking-wider">{tx.date}</div>
                        </div>
                    </div>
                    <div className={`font-mono font-bold text-sm ${tx.amount > 0 ? 'text-[#BEFF1D]' : 'text-white'}`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                    </div>
                </div>
            ))}
        </div>
      </div>

    </div>
  );
};

export default WalletPage;
