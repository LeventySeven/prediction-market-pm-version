'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Image, Lock, Mail, User as UserIcon } from 'lucide-react';
import Button from './Button';
import type { User } from '@/types';

export type ProfileSetupAvatarMode = 'unchanged' | 'upload' | 'import_telegram' | 'clear';

export type ProfileSetupSubmitPayload = {
  displayName: string;
  email: string;
  profileDescription: string;
  avatarMode: ProfileSetupAvatarMode;
  avatarFile: File | null;
};

type ProfileSetupModalProps = {
  isOpen: boolean;
  user: User | null;
  lang: 'RU' | 'EN';
  saving: boolean;
  error: string | null;
  onSubmit: (payload: ProfileSetupSubmitPayload) => Promise<void>;
};

const isPrivyPlaceholderEmail = (value?: string | null) =>
  Boolean(value && value.trim().toLowerCase().endsWith('@privy.local'));

const isPrivyPlaceholderName = (value?: string | null) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized.startsWith('privy_');
};

const initialsFrom = (value?: string) => {
  const v = String(value ?? '').trim();
  if (!v) return '?';
  const parts = v.split(/[\s._-]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? v[0];
  const b = parts[1]?.[0] ?? v[1] ?? '';
  return `${a}${b}`.toUpperCase();
};

const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({ isOpen, user, lang, saving, error, onSubmit }) => {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [avatarMode, setAvatarMode] = useState<ProfileSetupAvatarMode>('unchanged');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen || !user) return;
    const suggestedName = isPrivyPlaceholderName(user.name)
      ? ''
      : String(user.name ?? user.username ?? '').trim();
    const suggestedEmail = isPrivyPlaceholderEmail(user.email) ? '' : String(user.email ?? '').trim();
    setDisplayName(suggestedName);
    setEmail(suggestedEmail);
    setProfileDescription(String(user.profileDescription ?? '').trim());
    setAvatarMode('unchanged');
    setAvatarFile(null);
    setLocalError(null);
  }, [isOpen, user]);

  useEffect(() => {
    if (!avatarFile) {
      setPreviewUrl(null);
      return;
    }
    const next = URL.createObjectURL(avatarFile);
    setPreviewUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [avatarFile]);

  const displayNameTrimmed = displayName.trim();
  const isNameValid = displayNameTrimmed.length >= 2;

  const avatarSrc = useMemo(() => {
    if (avatarMode === 'clear') return null;
    if (previewUrl) return previewUrl;
    if (avatarMode === 'import_telegram' && user?.telegramPhotoUrl) return user.telegramPhotoUrl;
    return user?.avatarUrl ?? user?.telegramPhotoUrl ?? null;
  }, [avatarMode, previewUrl, user?.avatarUrl, user?.telegramPhotoUrl]);

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-900 bg-black p-5 sm:p-6 shadow-2xl">
        <div className="flex items-start gap-3 mb-5">
          <div className="h-9 w-9 rounded-full border border-zinc-800 bg-zinc-950/50 flex items-center justify-center text-zinc-300">
            <Lock size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">
              {lang === 'RU' ? 'Завершите профиль' : 'Complete your profile'}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {lang === 'RU'
                ? 'Окно обязательно после входа. Продолжить можно после ввода никнейма.'
                : 'This step is required after login. Continue after setting a nickname.'}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
              {lang === 'RU' ? 'Никнейм (обязательно)' : 'Nickname (required)'}
            </div>
            <div className="relative">
              <UserIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={lang === 'RU' ? 'Ваш никнейм' : 'Your nickname'}
                className="w-full h-11 rounded-full bg-zinc-950 border border-zinc-900 pl-9 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
              {lang === 'RU' ? 'Email (необязательно)' : 'Email (optional)'}
            </div>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={lang === 'RU' ? 'you@example.com' : 'you@example.com'}
                className="w-full h-11 rounded-full bg-zinc-950 border border-zinc-900 pl-9 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
              {lang === 'RU' ? 'Описание профиля' : 'Profile description'}
            </div>
            <div className="relative">
              <FileText size={14} className="absolute left-3 top-3 text-zinc-600" />
              <textarea
                value={profileDescription}
                onChange={(e) => setProfileDescription(e.target.value)}
                maxLength={280}
                rows={3}
                placeholder={lang === 'RU' ? 'Коротко о себе' : 'Short bio'}
                className="w-full rounded-2xl bg-zinc-950 border border-zinc-900 pl-9 pr-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700 resize-none"
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
              {lang === 'RU' ? 'Аватар' : 'Avatar'}
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-12 w-12 rounded-full border border-zinc-800 bg-zinc-950/40 overflow-hidden flex items-center justify-center text-zinc-100 font-semibold">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt={displayNameTrimmed || 'avatar'} className="h-full w-full object-cover" />
                ) : (
                  initialsFrom(displayNameTrimmed || user.name || user.username)
                )}
              </div>
              <div className="text-xs text-zinc-500">
                {lang === 'RU'
                  ? 'Цвета профиля будут автоматически взяты из выбранного аватара.'
                  : 'Profile colors will be generated from the selected avatar.'}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setAvatarFile(file);
                setAvatarMode(file ? 'upload' : 'unchanged');
              }}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                fullWidth
                variant="outline"
                className="h-10 rounded-full border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                <span className="inline-flex items-center gap-2">
                  <Image size={14} />
                  {lang === 'RU' ? 'Загрузить' : 'Upload'}
                </span>
              </Button>
              <Button
                fullWidth
                variant="outline"
                className="h-10 rounded-full border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60"
                onClick={() => {
                  setAvatarFile(null);
                  setAvatarMode('import_telegram');
                }}
                disabled={saving || !user.telegramPhotoUrl}
              >
                {lang === 'RU' ? 'Из Telegram' : 'From Telegram'}
              </Button>
              <Button
                fullWidth
                variant="ghost"
                className="h-10 rounded-full"
                onClick={() => {
                  setAvatarFile(null);
                  setAvatarMode('clear');
                }}
                disabled={saving}
              >
                {lang === 'RU' ? 'Сбросить' : 'Clear'}
              </Button>
            </div>
          </div>

          {(localError || error) && <div className="text-xs text-[rgba(245,68,166,1)]">{localError || error}</div>}

          <Button
            fullWidth
            className="h-11 rounded-full"
            disabled={saving || !isNameValid}
            onClick={async () => {
              setLocalError(null);
              if (!isNameValid) {
                setLocalError(lang === 'RU' ? 'Введите никнейм (минимум 2 символа)' : 'Enter a nickname (minimum 2 characters)');
                return;
              }

              const emailValue = email.trim();
              if (emailValue.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
                setLocalError(lang === 'RU' ? 'Введите корректный email' : 'Enter a valid email');
                return;
              }

              await onSubmit({
                displayName: displayNameTrimmed,
                email: emailValue,
                profileDescription: profileDescription.trim(),
                avatarMode,
                avatarFile,
              });
            }}
          >
            {saving ? (lang === 'RU' ? 'Сохранение…' : 'Saving…') : (lang === 'RU' ? 'Продолжить' : 'Continue')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProfileSetupModal;
