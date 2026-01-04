'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  const [isEditing, setIsEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [avatarMode, setAvatarMode] = useState<'unchanged' | 'upload' | 'import_telegram' | 'clear'>('unchanged');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const activeBets = bets.filter((b) => b.status === 'open');
  const settledBets = bets.filter((b) => b.status !== 'open');

  const formatMoney = (value: number) => `$${value.toFixed(2)}`;

  return (
    <div className="max-w-xl mx-auto px-4 py-6 pb-24 animate-in fade-in duration-300">
      {/* Profile header */}
      <div className="border border-zinc-900 bg-black rounded-2xl p-5">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-zinc-950/40 border border-zinc-900 overflow-hidden flex items-center justify-center text-zinc-100 font-bold">
            {avatarPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreviewUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              initialsFrom(displayName)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-zinc-100 truncate">{displayName}</h1>
              <button
                type="button"
                onClick={() => {
                  setEditError(null);
                  setNameDraft(displayName);
                  setAvatarMode('unchanged');
                  setAvatarFile(null);
                  setIsEditing(true);
                }}
                className="h-8 w-8 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 transition-colors flex items-center justify-center text-zinc-300"
                title={lang === 'RU' ? 'Редактировать профиль' : 'Edit profile'}
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
            {handle && <div className="text-sm text-zinc-500 truncate">{handle}</div>}
            <div className="mt-2 space-y-1 text-sm text-zinc-400">
              {user.email && !isTelegramPlaceholderEmail(user.email) && (
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

        {/* Full-width edit panel (better alignment on mobile/miniapp) */}
        {isEditing && (
          <div className="mt-4 w-full border border-zinc-900 bg-zinc-950/30 rounded-2xl p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                  {lang === 'RU' ? 'Никнейм' : 'Nickname'}
                </div>
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder={lang === 'RU' ? 'Никнейм' : 'Display name'}
                  className="w-full h-11 rounded-full bg-zinc-950 border border-zinc-900 px-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                />
              </div>

              <div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                  {lang === 'RU' ? 'Аватар' : 'Avatar'}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setAvatarFile(f);
                    setAvatarMode(f ? 'upload' : 'unchanged');
                  }}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button
                    fullWidth
                    variant="outline"
                    className="h-11 rounded-full border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Image size={14} />
                      {lang === 'RU' ? 'Загрузить фото' : 'Upload photo'}
                    </span>
                  </Button>
                  <Button
                    fullWidth
                    variant="outline"
                    className="h-11 rounded-full border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60"
                    onClick={() => {
                      setAvatarFile(null);
                      setAvatarMode('import_telegram');
                    }}
                    disabled={saving || !user.telegramPhotoUrl}
                    title={
                      user.telegramPhotoUrl
                        ? undefined
                        : lang === 'RU'
                        ? 'Нет аватара в Telegram'
                        : 'No Telegram avatar'
                    }
                  >
                    {lang === 'RU' ? 'Импорт из Telegram' : 'Import from Telegram'}
                  </Button>
                  <Button
                    fullWidth
                    variant="ghost"
                    className="h-11 rounded-full"
                    onClick={() => {
                      setAvatarFile(null);
                      setAvatarMode('clear');
                    }}
                    disabled={saving}
                  >
                    {lang === 'RU' ? 'Сбросить' : 'Reset'}
                  </Button>
                </div>

                {avatarFile && (
                  <div className="mt-2 text-xs text-zinc-500">
                    {lang === 'RU' ? 'Выбран файл:' : 'Selected file:'} {avatarFile.name}
                  </div>
                )}
                {avatarMode === 'import_telegram' && (
                  <div className="mt-2 text-xs text-zinc-500">
                    {lang === 'RU' ? 'Будет использован аватар из Telegram' : 'Will use your Telegram avatar'}
                  </div>
                )}
                {avatarMode === 'clear' && (
                  <div className="mt-2 text-xs text-zinc-500">
                    {lang === 'RU' ? 'Аватар будет сброшен' : 'Avatar will be cleared'}
                  </div>
                )}
              </div>

              {editError && <div className="text-xs text-[rgba(201,37,28,1)]">{editError}</div>}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  fullWidth
                  className="h-11 rounded-full"
                  disabled={saving}
                  onClick={async () => {
                    setEditError(null);
                    const nextName = nameDraft.trim();
                    if (nextName.length < 2) {
                      setEditError(lang === 'RU' ? 'Слишком короткий ник' : 'Name is too short');
                      return;
                    }

                    setSaving(true);
                    try {
                      if (nextName !== displayName) {
                        await onUpdateDisplayName(nextName);
                      }

                      if (avatarMode === 'upload' && avatarFile) {
                        const fd = new FormData();
                        fd.append('file', avatarFile);
                        const resp = await fetch('/api/avatar/upload', { method: 'POST', body: fd });
                        const data = (await resp.json()) as { avatarUrl?: string; error?: string };
                        if (!resp.ok || !data.avatarUrl) {
                          throw new Error(data.error || 'UPLOAD_FAILED');
                        }
                        await onUpdateAvatarUrl(data.avatarUrl);
                      } else if (avatarMode === 'import_telegram') {
                        if (!user.telegramPhotoUrl) {
                          throw new Error('NO_TELEGRAM_AVATAR');
                        }
                        await onUpdateAvatarUrl(user.telegramPhotoUrl);
                      } else if (avatarMode === 'clear') {
                        await onUpdateAvatarUrl(null);
                      }

                      setIsEditing(false);
                      setAvatarFile(null);
                      setAvatarMode('unchanged');
                    } catch {
                      setEditError(lang === 'RU' ? 'Не удалось сохранить' : 'Failed to save');
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? (lang === 'RU' ? 'Сохранение…' : 'Saving…') : (lang === 'RU' ? 'Сохранить' : 'Save')}
                </Button>
                <Button
                  fullWidth
                  variant="outline"
                  className="h-11 rounded-full border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60"
                  disabled={saving}
                  onClick={() => {
                    setEditError(null);
                    setIsEditing(false);
                    setAvatarFile(null);
                    setAvatarMode('unchanged');
                  }}
                >
                  {lang === 'RU' ? 'Отмена' : 'Cancel'}
                </Button>
              </div>
            </div>
          </div>
        )}
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


