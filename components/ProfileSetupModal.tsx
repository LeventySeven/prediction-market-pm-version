'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import { FileText, Image, Lock, Mail, User as UserIcon } from 'lucide-react';
import Button from './Button';
import type { User } from '@/types';
import { trpcClient } from '@/src/utils/trpcClient';

export type ProfileSetupAvatarMode = 'unchanged' | 'upload' | 'import_telegram' | 'clear';

export type ProfileSetupSubmitPayload = {
  username: string;
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

const normalizeHandleInput = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\-.]+|[_\-.]+$/g, '')
    .slice(0, 32);

const isValidHandle = (value: string) => /^[a-z0-9_.-]{3,32}$/.test(value);

const isPrivyPlaceholderHandle = (value?: string | null) => {
  const normalized = normalizeHandleInput(String(value ?? ''));
  return normalized.startsWith('privy_') || normalized.startsWith('privy-');
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
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [avatarMode, setAvatarMode] = useState<ProfileSetupAvatarMode>('unchanged');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameReason, setUsernameReason] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen || !user) return;
    const suggestedHandle = isPrivyPlaceholderHandle(user.username)
      ? ''
      : normalizeHandleInput(String(user.username ?? ''));
    const suggestedName = isPrivyPlaceholderName(user.name)
      ? ''
      : String(user.name ?? user.username ?? '').trim();
    const suggestedEmail = isPrivyPlaceholderEmail(user.email) ? '' : String(user.email ?? '').trim();
    setUsername(suggestedHandle);
    setDisplayName(suggestedName);
    setEmail(suggestedEmail);
    setProfileDescription(String(user.profileDescription ?? '').trim());
    setAvatarMode('unchanged');
    setAvatarFile(null);
    setLocalError(null);
    setUsernameChecking(false);
    setUsernameAvailable(null);
    setUsernameReason(null);
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

  const usernameNormalized = useMemo(() => normalizeHandleInput(username), [username]);
  const isHandleFormatValid = isValidHandle(usernameNormalized);
  const displayNameTrimmed = displayName.trim();
  const isNameValid = displayNameTrimmed.length >= 2;
  const isHandleReady = isHandleFormatValid && usernameAvailable === true && !usernameChecking;

  useEffect(() => {
    if (!isOpen) return;
    if (!usernameNormalized) {
      setUsernameAvailable(null);
      setUsernameReason(null);
      setUsernameChecking(false);
      return;
    }
    if (!isHandleFormatValid) {
      setUsernameAvailable(false);
      setUsernameReason('INVALID_FORMAT');
      setUsernameChecking(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setUsernameChecking(true);
      void trpcClient.user.checkUsernameAvailability
        .query({ username: usernameNormalized })
        .then((result) => {
          if (cancelled) return;
          const normalized = normalizeHandleInput(String(result.normalized ?? usernameNormalized));
          if (normalized !== usernameNormalized) {
            setUsername(normalized);
          }
          setUsernameAvailable(Boolean(result.available));
          setUsernameReason(result.reason ?? null);
        })
        .catch(() => {
          if (cancelled) return;
          setUsernameAvailable(false);
          setUsernameReason('CHECK_FAILED');
        })
        .finally(() => {
          if (!cancelled) setUsernameChecking(false);
        });
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isHandleFormatValid, isOpen, usernameNormalized]);

  const avatarSrc = useMemo(() => {
    if (avatarMode === 'clear') return null;
    if (previewUrl) return previewUrl;
    if (avatarMode === 'import_telegram' && user?.telegramPhotoUrl) return user.telegramPhotoUrl;
    return user?.avatarUrl ?? user?.telegramPhotoUrl ?? null;
  }, [avatarMode, previewUrl, user?.avatarUrl, user?.telegramPhotoUrl]);

  if (!isOpen || !user) return null;

  const usernameStatusText = (() => {
    if (!usernameNormalized) {
      return lang === 'RU' ? 'Укажите уникальный @handle (3-32 символа).' : 'Set a unique @handle (3-32 chars).';
    }
    if (usernameChecking) {
      return lang === 'RU' ? 'Проверяем доступность...' : 'Checking availability...';
    }
    if (!isHandleFormatValid || usernameReason === 'INVALID_FORMAT') {
      return lang === 'RU' ? 'Допустимы: a-z, 0-9, _, ., - (3-32).' : 'Allowed: a-z, 0-9, _, ., - (3-32).';
    }
    if (usernameReason === 'RESERVED') {
      return lang === 'RU' ? 'Этот handle зарезервирован.' : 'This handle is reserved.';
    }
    if (usernameReason === 'TAKEN') {
      return lang === 'RU' ? 'Этот handle уже занят.' : 'This handle is already taken.';
    }
    if (usernameReason === 'CHECK_FAILED') {
      return lang === 'RU' ? 'Не удалось проверить handle.' : 'Could not verify handle availability.';
    }
    if (usernameAvailable) {
      return lang === 'RU' ? 'Handle доступен.' : 'Handle is available.';
    }
    return lang === 'RU' ? 'Проверьте handle.' : 'Please review the handle.';
  })();

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
                ? 'Обязательный шаг: укажите и @handle, и display name.'
                : 'Required step: set both @handle and display name.'}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
              {lang === 'RU' ? 'Handle (обязательно)' : 'Handle (required)'}
            </div>
            <div className="relative">
              <UserIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <span className="absolute left-8 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="username"
                className="w-full h-11 rounded-full bg-zinc-950 border border-zinc-900 pl-12 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
              />
            </div>
            <div className={`mt-1 text-[11px] ${usernameAvailable ? 'text-[rgba(190,255,29,1)]' : 'text-zinc-500'}`}>
              {usernameStatusText}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
              {lang === 'RU' ? 'Display name (обязательно)' : 'Display name (required)'}
            </div>
            <div className="relative">
              <UserIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={lang === 'RU' ? 'Ваше имя в интерфейсе' : 'Your display name'}
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
                placeholder="you@example.com"
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
              <div className="relative h-12 w-12 rounded-full border border-zinc-800 bg-zinc-950/40 overflow-hidden flex items-center justify-center text-zinc-100 font-semibold">
                {avatarSrc ? (
                  <NextImage src={avatarSrc} alt={displayNameTrimmed || 'avatar'} fill unoptimized className="object-cover" />
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
            disabled={saving || !isNameValid || !isHandleReady}
            onClick={async () => {
              setLocalError(null);
              if (!isHandleReady) {
                setLocalError(
                  lang === 'RU'
                    ? 'Укажите доступный handle перед продолжением.'
                    : 'Choose an available handle before continuing.'
                );
                return;
              }
              if (!isNameValid) {
                setLocalError(
                  lang === 'RU'
                    ? 'Введите display name (минимум 2 символа)'
                    : 'Enter a display name (minimum 2 characters)'
                );
                return;
              }

              const emailValue = email.trim();
              if (emailValue.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
                setLocalError(lang === 'RU' ? 'Введите корректный email' : 'Enter a valid email');
                return;
              }

              await onSubmit({
                username: usernameNormalized,
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
