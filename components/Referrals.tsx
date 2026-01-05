'use client';

import React, { useMemo, useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import Button from './Button';
import type { User } from '../types';

type ReferralsProps = {
  user: User | null;
  onLogin: () => void;
  lang: 'RU' | 'EN';
  onCreateReferralLink: () => Promise<{
    referralCode: string;
    referralCommissionRate: number;
    referralEnabled: boolean;
  }>;
};

const Referrals: React.FC<ReferralsProps> = ({ user, onLogin, lang, onCreateReferralLink }) => {
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const referralCode = user?.referralCode ?? null;
  const commissionRate = user?.referralCommissionRate ?? 0.5;
  const commissionPct = Math.round(commissionRate * 100);

  const inviteLink = useMemo(() => {
    if (!referralCode) return null;
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://yalla.market';
    return `${origin}/?ref=${encodeURIComponent(referralCode)}`;
  }, [referralCode]);

  const t = useMemo(
    () => ({
      title: lang === 'RU' ? 'Рефералы' : 'Referrals',
      subtitle:
        lang === 'RU'
          ? `Создайте ссылку и получайте ${commissionPct}% от комиссий друзей.`
          : `Create a link and earn ${commissionPct}% of your friends’ fees.`,
      create: lang === 'RU' ? 'Создать ссылку' : 'Create link',
      creating: lang === 'RU' ? 'Создание…' : 'Creating…',
      login: lang === 'RU' ? 'Войти' : 'Log in',
      copy: lang === 'RU' ? 'Скопировать' : 'Copy',
      placeholder: lang === 'RU' ? 'Сначала создайте ссылку' : 'Create a link first',
      copyError: lang === 'RU' ? 'Не удалось скопировать' : 'Failed to copy',
      createError: lang === 'RU' ? 'Не удалось создать ссылку' : 'Failed to create link',
      loginToCreate: lang === 'RU' ? 'Войдите, чтобы создать ссылку' : 'Log in to create a link',
      yourRate: lang === 'RU' ? 'Ваша ставка' : 'Your rate',
    }),
    [lang, commissionPct]
  );

  const handleCopy = async () => {
    setError(null);
    if (!user) {
      onLogin();
      return;
    }
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t.copyError);
    }
  };

  const handleCreate = async () => {
    setError(null);
    if (!user) {
      onLogin();
      return;
    }
    if (referralCode) return;
    setCreating(true);
    try {
      await onCreateReferralLink();
    } catch {
      setError(t.createError);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto animate-in fade-in duration-300">
      <div className="border border-zinc-900 bg-black rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-full border border-zinc-900 bg-zinc-950/40 flex items-center justify-center text-zinc-400 flex-shrink-0">
              <Link2 size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-100">{t.title}</div>
              <div className="text-xs text-zinc-500">{t.subtitle}</div>
            </div>
            </div>

          {!user ? (
            <Button onClick={onLogin} className="h-9 rounded-full px-4">
              {t.login}
            </Button>
          ) : !referralCode ? (
            <Button onClick={handleCreate} className="h-9 rounded-full px-4" disabled={creating}>
              {creating ? t.creating : t.create}
                </Button>
          ) : null}
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-2 rounded-xl border border-zinc-900 bg-zinc-950/40 px-3 py-2">
                        <input 
              readOnly
              value={!user ? t.loginToCreate : inviteLink ?? t.placeholder}
              className="w-full bg-transparent text-xs text-zinc-300 font-mono focus:outline-none"
                        />
                        <button 
              type="button"
              onClick={handleCopy}
              disabled={!inviteLink}
              className="h-8 w-8 rounded-lg border border-zinc-900 bg-black/40 hover:bg-black/60 transition-colors flex items-center justify-center text-zinc-300 disabled:opacity-50"
              title={t.copy}
            >
              {copied ? <Check size={14} className="text-[#E50C00]" /> : <Copy size={14} />}
                        </button>
                    </div>

          {error && <div className="mt-2 text-xs text-[#E50C00]">{error}</div>}

          {user && (
            <div className="mt-3 text-[11px] text-zinc-500">
              {t.yourRate}:{' '}
              <span className="text-zinc-200 font-semibold">{commissionPct}%</span>
                            </div>
                        )}
                    </div>
                </div>
    </div>
  );
};

export default Referrals;