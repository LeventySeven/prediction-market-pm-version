'use client';

import React, { useState } from 'react';
import { LogOut, Mail, User as UserIcon, Shield, Pencil, X, Image } from 'lucide-react';
import Button from './Button';
import type { Bet, Trade, User } from '../types';

type ProfilePageProps = {
  user: User | null;
  lang: 'RU' | 'EN';
  onLogin: () => void;
  onLogout: () => void;
  onUpdateDisplayName: (nextDisplayName: string) => Promise<void>;
  onUpdateAvatarUrl: (nextAvatarUrl: string | null) => Promise<void>;
  balanceMajor: number;
  pnlMajor: number;
  bets: Bet[];
  soldTrades: Trade[];
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

const ProfilePage: React.FC<ProfilePageProps> = ({
  user,
  lang,
  onLogin,
  onLogout,
  onUpdateDisplayName,
  onUpdateAvatarUrl,
  balanceMajor,
  pnlMajor,
  bets,
  soldTrades,
  onMarketClick,
}) => {
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
  const pnlIsPositive = (pnlMajor ?? 0) >= 0;
  const isTelegramPlaceholderEmail = (email?: string) =>
    Boolean(email && email.trim().toLowerCase().endsWith('@telegram.local'));
  const yesLabel = lang === 'RU' ? 'Да' : 'Yes';
  const noLabel = lang === 'RU' ? 'Нет' : 'No';
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState(user.avatarUrl ?? '');
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const activeBets = bets.filter((b) => b.status === 'open');
  const settledBets = bets.filter((b) => b.status !== 'open');

  const formatMoney = (value: number) => `$${value.toFixed(2)}`;

  return (
    <div className="max-w-xl mx-auto px-4 py-6 pb-24 animate-in fade-in duration-300">
      {/* Profile header */}
      <div className="border border-zinc-900 bg-black rounded-2xl p-5">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-zinc-950/40 border border-zinc-900 overflow-hidden flex items-center justify-center text-zinc-100 font-bold relative">
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              initialsFrom(displayName)
            )}
            <button
              type="button"
              onClick={() => {
                setAvatarError(null);
                setAvatarDraft(user.avatarUrl ?? '');
                setIsEditingAvatar(true);
              }}
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full border border-zinc-900 bg-zinc-950/80 hover:bg-zinc-950 transition-colors flex items-center justify-center text-zinc-300"
              title={lang === 'RU' ? 'Изменить аватар' : 'Edit avatar'}
            >
              <Image size={14} />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-zinc-100 truncate">{displayName}</h1>
              <button
                type="button"
                onClick={() => {
                  setNameError(null);
                  setNameDraft(displayName);
                  setIsEditingName(true);
                }}
                className="h-8 w-8 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 transition-colors flex items-center justify-center text-zinc-300"
                title={lang === 'RU' ? 'Изменить ник' : 'Edit nickname'}
              >
                <Pencil size={14} />
              </button>
              {user.isAdmin && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border border-zinc-900 bg-zinc-950/40 text-zinc-200">
                  <Shield size={12} />
                  {lang === 'RU' ? 'Админ' : 'Admin'}
                </span>
              )}
            </div>
            {isEditingName && (
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder={lang === 'RU' ? 'Никнейм' : 'Display name'}
                    className="flex-1 h-10 rounded-full bg-zinc-950 border border-zinc-900 px-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                  />
                  <Button
                    onClick={async () => {
                      setNameError(null);
                      const next = nameDraft.trim();
                      if (next.length < 2) {
                        setNameError(lang === 'RU' ? 'Слишком короткий ник' : 'Name is too short');
                        return;
                      }
                      setSavingName(true);
                      try {
                        await onUpdateDisplayName(next);
                        setIsEditingName(false);
                      } catch (e) {
                        setNameError(lang === 'RU' ? 'Не удалось сохранить' : 'Failed to save');
                      } finally {
                        setSavingName(false);
                      }
                    }}
                    className="h-10 rounded-full px-4"
                    disabled={savingName}
                  >
                    {savingName ? (lang === 'RU' ? 'Сохранение…' : 'Saving…') : (lang === 'RU' ? 'Сохранить' : 'Save')}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setNameError(null);
                      setIsEditingName(false);
                    }}
                    className="h-10 w-10 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 transition-colors flex items-center justify-center text-zinc-300"
                    title={lang === 'RU' ? 'Отмена' : 'Cancel'}
                  >
                    <X size={16} />
                  </button>
                </div>
                {nameError && <div className="mt-2 text-xs text-[rgba(201,37,28,1)]">{nameError}</div>}
              </div>
            )}
            {handle && <div className="text-sm text-zinc-500 truncate">{handle}</div>}
            <div className="mt-2 space-y-1 text-sm text-zinc-400">
              {user.email && !isTelegramPlaceholderEmail(user.email) && (
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-zinc-600" />
                  <span className="truncate">{user.email}</span>
                </div>
              )}
              {isEditingAvatar && (
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={avatarDraft}
                      onChange={(e) => setAvatarDraft(e.target.value)}
                      placeholder={lang === 'RU' ? 'URL аватара (https://...)' : 'Avatar URL (https://...)'}
                      className="flex-1 h-10 rounded-full bg-zinc-950 border border-zinc-900 px-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                    />
                    <Button
                      onClick={async () => {
                        setAvatarError(null);
                        const next = avatarDraft.trim();
                        if (next.length > 0) {
                          try {
                            // Basic URL validation on client
                            const u = new URL(next);
                            if (u.protocol !== 'https:' && u.protocol !== 'http:') {
                              setAvatarError(lang === 'RU' ? 'Нужен http(s) URL' : 'Avatar URL must be http(s)');
                              return;
                            }
                          } catch {
                            setAvatarError(lang === 'RU' ? 'Некорректный URL' : 'Invalid URL');
                            return;
                          }
                        }
                        setSavingAvatar(true);
                        try {
                          await onUpdateAvatarUrl(next.length ? next : null);
                          setIsEditingAvatar(false);
                        } catch {
                          setAvatarError(lang === 'RU' ? 'Не удалось сохранить' : 'Failed to save');
                        } finally {
                          setSavingAvatar(false);
                        }
                      }}
                      className="h-10 rounded-full px-4"
                      disabled={savingAvatar}
                    >
                      {savingAvatar ? (lang === 'RU' ? 'Сохранение…' : 'Saving…') : (lang === 'RU' ? 'Сохранить' : 'Save')}
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarError(null);
                        setIsEditingAvatar(false);
                      }}
                      className="h-10 w-10 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 transition-colors flex items-center justify-center text-zinc-300"
                      title={lang === 'RU' ? 'Отмена' : 'Cancel'}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setAvatarError(null);
                        setSavingAvatar(true);
                        try {
                          await onUpdateAvatarUrl(null);
                          setAvatarDraft('');
                          setIsEditingAvatar(false);
                        } catch {
                          setAvatarError(lang === 'RU' ? 'Не удалось сбросить' : 'Failed to reset');
                        } finally {
                          setSavingAvatar(false);
                        }
                      }}
                      className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-4"
                      disabled={savingAvatar}
                    >
                      {lang === 'RU' ? 'Сбросить (использовать Telegram/инициалы)' : 'Reset (use Telegram/initials)'}
                    </button>
                  </div>
                  {avatarError && <div className="mt-2 text-xs text-[rgba(201,37,28,1)]">{avatarError}</div>}
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

      {/* Balance + PnL */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="border border-zinc-900 bg-black rounded-2xl p-4">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
            {lang === 'RU' ? 'Баланс' : 'Balance'}
          </div>
          <div className="text-2xl font-mono font-bold text-zinc-100">
            {formatMoney(balanceMajor)}
          </div>
        </div>
        <div className="border border-zinc-900 bg-black rounded-2xl p-4">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
            PnL
          </div>
          <div
            className={`text-2xl font-mono font-bold ${
              pnlIsPositive ? 'text-[rgba(36,182,255,1)]' : 'text-[rgba(201,37,28,1)]'
            }`}
          >
            {pnlIsPositive ? '+' : '-'}${Math.abs(pnlMajor).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Transactions (bet history) */}
      <div className="mt-8">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 px-1">
          {lang === 'RU' ? 'Транзакции' : 'Transactions'}
        </h2>

        {/* Active */}
        <div className="mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-1">
            {lang === 'RU' ? 'Активные' : 'Active'}
          </div>
          {activeBets.length === 0 ? (
            <div className="text-sm text-zinc-500 px-1">
              {lang === 'RU' ? 'Нет активных ставок' : 'No active bets'}
            </div>
          ) : (
            <div className="space-y-3">
              {activeBets.map((b) => {
                const title = (lang === 'RU' ? b.marketTitleRu : b.marketTitleEn) || b.marketTitle;
                const sideLabel = b.side === 'YES' ? yesLabel : noLabel;
                const sideColor = b.side === 'YES' ? 'text-[rgba(36,182,255,1)]' : 'text-[rgba(201,37,28,1)]';
                return (
                  <button
                    key={b.id}
                    type="button"
                    className="w-full text-left border border-zinc-900 bg-black rounded-2xl p-4 hover:bg-zinc-950/40 transition-colors"
                    onClick={() => onMarketClick(b.marketId)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-100 truncate">{title}</div>
                        <div className="mt-1 text-xs text-zinc-500 flex items-center gap-2">
                          <span className={`font-semibold ${sideColor}`}>{sideLabel}</span>
                          <span className="text-zinc-600">•</span>
                          <span className="font-mono text-zinc-300">
                            {lang === 'RU' ? 'Куплено на' : 'Bought for'} {formatMoney(b.amount)}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500 flex-shrink-0">
                        {lang === 'RU' ? 'Открыта' : 'Open'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Completed */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-1">
            {lang === 'RU' ? 'Завершенные' : 'Completed'}
          </div>

          {(settledBets.length === 0 && soldTrades.length === 0) ? (
            <div className="text-sm text-zinc-500 px-1">
              {lang === 'RU' ? 'Нет завершенных ставок' : 'No completed bets'}
            </div>
          ) : (
            <div className="space-y-3">
              {settledBets.map((b) => {
                const title = (lang === 'RU' ? b.marketTitleRu : b.marketTitleEn) || b.marketTitle;
                const won = b.status === 'won';
                const resultLabel = lang === 'RU' ? (won ? 'ВЫИГРЫШ' : 'ПОТЕРЯ') : (won ? 'WON' : 'LOST');
                const resultColor = won ? 'text-[rgba(36,182,255,1)]' : 'text-[rgba(201,37,28,1)]';
                const redeem = b.payout ?? 0;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className="w-full text-left border border-zinc-900 bg-black rounded-2xl p-4 hover:bg-zinc-950/40 transition-colors"
                    onClick={() => onMarketClick(b.marketId)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-100 truncate">{title}</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          <span className="font-mono text-zinc-300">
                            {lang === 'RU' ? 'Куплено на' : 'Bought for'} {formatMoney(b.amount)}
                          </span>
                          <span className="text-zinc-600"> → </span>
                          <span className="font-mono text-zinc-300">
                            {lang === 'RU' ? 'Погашено на' : 'Redeemed for'} {formatMoney(redeem)}
                          </span>
                        </div>
                      </div>
                      <div className={`text-xs font-semibold uppercase tracking-wider ${resultColor}`}>
                        {resultLabel}
                      </div>
                    </div>
                  </button>
                );
              })}

              {soldTrades.map((t) => {
                const title = t.marketTitleRu || t.marketTitleEn || t.marketId;
                const sharesSold = Math.abs(t.sharesDelta);
                const avgEntry = t.avgEntryPrice ?? null;
                const boughtFor = avgEntry !== null ? avgEntry * sharesSold : null;
                const soldFor = Math.abs(t.collateralNet);
                const sideLabel = t.outcome === 'YES' ? yesLabel : noLabel;
                const sideColor = t.outcome === 'YES' ? 'text-[rgba(36,182,255,1)]' : 'text-[rgba(201,37,28,1)]';
                const resolvedOutcome = t.marketOutcome ? String(t.marketOutcome) : null;
                const outcomeText =
                  resolvedOutcome === 'YES' ? yesLabel : resolvedOutcome === 'NO' ? noLabel : null;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="w-full text-left border border-zinc-900 bg-black rounded-2xl p-4 hover:bg-zinc-950/40 transition-colors"
                    onClick={() => onMarketClick(t.marketId)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-100 truncate">{title}</div>
                        <div className="mt-1 text-xs text-zinc-500 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${sideColor}`}>{sideLabel}</span>
                            <span className="text-zinc-600">•</span>
                            <span className="font-mono text-zinc-300">
                              {lang === 'RU' ? 'Куплено на' : 'Bought for'}{' '}
                              {boughtFor !== null ? formatMoney(boughtFor) : '—'}
                            </span>
                            <span className="text-zinc-600"> → </span>
                            <span className="font-mono text-zinc-300">
                              {lang === 'RU' ? 'Продано за' : 'Sold for'} {formatMoney(soldFor)}
                            </span>
                          </div>
                          {outcomeText && (
                            <div className="text-[11px] text-zinc-500">
                              {lang === 'RU' ? 'Исход события' : 'Event outcome'}: {outcomeText}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500 flex-shrink-0">
                        {lang === 'RU' ? 'Продано' : 'Sold'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;


