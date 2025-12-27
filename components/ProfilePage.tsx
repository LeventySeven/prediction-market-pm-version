'use client';

import React, { useMemo } from 'react';
import { LogOut, Mail, User as UserIcon, Shield, ChevronRight } from 'lucide-react';
import Button from './Button';
import type { Bet, User } from '../types';

type ProfilePageProps = {
  user: User | null;
  lang: 'RU' | 'EN';
  onLogin: () => void;
  onLogout: () => void;
  bets: Bet[];
  onMarketClick: (marketId: string) => void;
};

const initialsFrom = (value?: string) => {
  const v = (value ?? '').trim();
  if (!v) return '?';
  const parts = v.split(/[\s._-]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? v[0];
  const b = parts[1]?.[0] ?? v[1] ?? '';
  return `${a}${b}`.toUpperCase();
};

const formatDate = (iso?: string, lang: 'RU' | 'EN' = 'RU') => {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString(lang === 'RU' ? 'ru-RU' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
};

const ProfilePage: React.FC<ProfilePageProps> = ({ user, lang, onLogin, onLogout, bets, onMarketClick }) => {
  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 pb-24">
        <div className="border border-zinc-900 bg-black rounded-2xl p-6 text-center">
          <div className="mx-auto h-14 w-14 rounded-full border border-zinc-900 bg-zinc-950/40 flex items-center justify-center text-zinc-400">
            <UserIcon size={22} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-100">
            {lang === 'RU' ? 'Профиль недоступен' : 'Profile locked'}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {lang === 'RU' ? 'Войдите, чтобы увидеть профиль' : 'Log in to view your profile'}
          </p>
          <div className="mt-6 flex justify-center">
            <Button onClick={onLogin}>{lang === 'RU' ? 'Войти' : 'Log in'}</Button>
          </div>
        </div>
      </div>
    );
  }

  const displayName = user.name ?? user.username ?? (lang === 'RU' ? 'Пользователь' : 'User');
  const handle = user.username ? `@${user.username}` : null;
  const joined = formatDate(user.createdAt, lang);

  const activeBets = useMemo(() => bets.filter((b) => b.status === 'open'), [bets]);

  return (
    <div className="max-w-xl mx-auto px-4 py-6 pb-24 animate-in fade-in duration-300">
      <div className="border border-zinc-900 bg-black rounded-2xl p-5">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-zinc-950/40 border border-zinc-900 flex items-center justify-center text-zinc-100 font-bold">
            {initialsFrom(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-zinc-100 truncate">{displayName}</h1>
              {user.isAdmin && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border border-zinc-900 bg-zinc-950/40 text-zinc-200">
                  <Shield size={12} />
                  {lang === 'RU' ? 'Админ' : 'Admin'}
                </span>
              )}
            </div>
            {handle && <div className="text-sm text-zinc-500 truncate">{handle}</div>}
            <div className="mt-2 space-y-1 text-sm text-zinc-400">
              {user.email && (
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-zinc-600" />
                  <span className="truncate">{user.email}</span>
                </div>
              )}
              {joined && (
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                  {lang === 'RU' ? 'Создан' : 'Joined'}: {joined}
                </div>
              )}
            </div>
          </div>

          <Button
            variant="outline"
            onClick={onLogout}
            className="h-9 px-3 rounded-full border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60"
            title={lang === 'RU' ? 'Выйти' : 'Log out'}
          >
            <span className="sr-only">{lang === 'RU' ? 'Выйти' : 'Log out'}</span>
            <LogOut size={16} />
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 px-1">
          {lang === 'RU' ? 'Активные ставки' : 'Active bets'}
        </h2>
        {activeBets.length === 0 ? (
          <div className="text-sm text-zinc-500 px-1">
            {lang === 'RU' ? 'Нет активных ставок' : 'No active bets'}
          </div>
        ) : (
          <div className="space-y-3">
            {activeBets.map((bet) => (
              <button
                key={bet.id}
                type="button"
                onClick={() => onMarketClick(bet.marketId)}
                className="w-full text-left border border-zinc-900 bg-black rounded-2xl p-4 hover:bg-zinc-950/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-100 truncate">
                      {(lang === 'RU' ? bet.marketTitleRu : bet.marketTitleEn) || bet.marketTitle}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 flex items-center gap-2">
                      <span
                        className={`font-semibold ${
                          bet.side === 'YES'
                            ? 'text-[rgba(36,182,255,1)]'
                            : 'text-[rgba(201,37,28,1)]'
                        }`}
                      >
                        {bet.side === 'YES' ? (lang === 'RU' ? 'ДА' : 'YES') : (lang === 'RU' ? 'НЕТ' : 'NO')}
                      </span>
                      <span className="text-zinc-500">•</span>
                      <span className="font-mono text-zinc-300">${bet.amount.toFixed(2)}</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-zinc-700 flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;


