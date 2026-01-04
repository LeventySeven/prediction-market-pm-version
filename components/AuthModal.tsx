import React, { useEffect, useMemo, useState } from 'react';
import { X, Mail, User, Lock, Send } from 'lucide-react';
import Button from './Button';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (payload: { emailOrUsername: string; password: string }) => void | Promise<void>;
  onSignUp: (payload: { email: string; username: string; password: string }) => void | Promise<void>;
  onTelegramLogin?: (initData: string) => void | Promise<void>;
  lang?: 'RU' | 'EN';
  initialMode?: AuthMode;
}

export type AuthMode = 'SIGN_IN' | 'SIGN_UP';

const friendlyMessages = {
  RU: {
    loginTitle: 'Войдите в Yalla Market',
    signupTitle: 'Создайте аккаунт Yalla Market',
    loginSubtitle: 'Используйте email или username и пароль.',
    signupSubtitle: 'Заполните все поля, чтобы зарегистрироваться.',
    loginTab: 'Вход',
    signupTab: 'Регистрация',
    emailOrUsername: 'Email или Username',
    email: 'Email',
    username: 'Username',
    password: 'Пароль',
    placeholderEmail: 'имя@пример.com',
    placeholderUsername: 'yalla_trader',
    placeholderPassword: '********',
    placeholderEmailOrUsername: 'имя@пример.com / yalla_trader',
    loginButton: 'Войти',
    signupButton: 'Создать аккаунт',
    loginRequired: 'Введите email/username и пароль.',
    signupRequired: 'Заполните email, username и пароль.',
    genericError: 'Не удалось выполнить запрос',
    loadingText: 'Пожалуйста, подождите...',
    telegramButton: 'Продолжить через Telegram',
    telegramHint: '1 клик • без пароля',
    orDivider: 'или',
  },
  EN: {
    loginTitle: 'Log in to Yalla Market',
    signupTitle: 'Create your Yalla Market account',
    loginSubtitle: 'Use your email or username plus password.',
    signupSubtitle: 'All fields are required.',
    loginTab: 'Log in',
    signupTab: 'Sign up',
    emailOrUsername: 'Email or Username',
    email: 'Email',
    username: 'Username',
    password: 'Password',
    placeholderEmail: 'name@example.com',
    placeholderUsername: 'yalla_trader',
    placeholderPassword: '********',
    loginButton: 'Log in',
    signupButton: 'Create account',
    loginRequired: 'Enter email/username and password.',
    signupRequired: 'Fill in email, username, and password.',
    genericError: 'Request failed',
    placeholderEmailOrUsername: 'you@example.com / yalla_trader',
    loadingText: 'Please wait...',
    telegramButton: 'Continue with Telegram',
    telegramHint: '1 click • no password',
    orDivider: 'or',
  },
};

const translateFieldError = (
  lang: 'RU' | 'EN',
  opts: { field?: string; validation?: string; code?: string; message?: string }
) => {
  const field = opts.field?.toLowerCase();
  const validation = opts.validation?.toLowerCase();
  const code = opts.code?.toLowerCase();

  if (validation === 'email' || field === 'email') {
    return lang === 'RU' ? 'Укажите корректный email.' : 'Enter a valid email address.';
  }

  if (validation === 'regex' || field === 'username') {
    return lang === 'RU'
      ? 'Username может содержать только буквы, цифры, _, . или -.'
      : 'Username may contain letters, numbers, _, ., or -.';
  }

  if (field === 'password' || validation === 'password' || code === 'too_small') {
    return lang === 'RU'
      ? 'Пароль должен содержать минимум 8 символов.'
      : 'Password must contain at least 8 characters.';
  }

  return opts.message ?? friendlyMessages[lang].genericError;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const getZodFieldErrors = (
  error: unknown
): Record<string, string[] | undefined> | undefined => {
  if (!isRecord(error)) return undefined;
  const data = error.data;
  if (!isRecord(data)) return undefined;
  const zodError = data.zodError;
  if (!isRecord(zodError)) return undefined;
  const fieldErrors = zodError.fieldErrors;
  if (!isRecord(fieldErrors)) return undefined;
  const result: Record<string, string[] | undefined> = {};
  Object.entries(fieldErrors).forEach(([key, value]) => {
    if (value === undefined) {
      result[key] = undefined;
    } else if (isStringArray(value)) {
      result[key] = value;
    }
  });
  return result;
};

const getMessageString = (error: unknown): string | undefined => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  return undefined;
};

const formatErrorMessage = (err: unknown, lang: 'RU' | 'EN'): string => {
  const t = friendlyMessages[lang];
  const zodErrors = getZodFieldErrors(err);
  if (zodErrors) {
    const messages = Object.entries(zodErrors)
      .flatMap(([field, list]) =>
        (list ?? []).map((msg) => translateFieldError(lang, { field, message: msg }))
      )
      .filter(Boolean);
    if (messages.length) {
      return messages.join(' ');
    }
  }

  const messageString = getMessageString(err);
  if (messageString) {
    try {
      const parsed = JSON.parse(messageString);
      if (Array.isArray(parsed)) {
        const parsedMessages = parsed
          .map((item) =>
            typeof item === 'object' && item !== null
              ? translateFieldError(lang, {
                  field: Array.isArray(item.path) ? item.path[0] : undefined,
                  validation:
                    typeof item.validation === 'string' ? item.validation : undefined,
                  code: typeof item.code === 'string' ? item.code : undefined,
                  message: typeof item.message === 'string' ? item.message : undefined,
                })
              : JSON.stringify(item)
          )
          .filter(Boolean);
        if (parsedMessages.length) {
          return parsedMessages.join(' ');
        }
      }
    } catch {
      // messageString was not JSON; fall through
    }
    return translateFieldError(lang, { message: messageString });
  }

  return t.genericError;
};

const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onSignUp,
  onTelegramLogin,
  lang = 'RU',
  initialMode,
}) => {
  const [mode, setMode] = useState<AuthMode>('SIGN_IN');
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = friendlyMessages[lang];
  const modalTitle = mode === 'SIGN_IN' ? t.loginTitle : t.signupTitle;
  const modalSubtitle = mode === 'SIGN_IN' ? t.loginSubtitle : t.signupSubtitle;

  const telegramInitData = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { Telegram?: { WebApp?: { initData?: unknown } } };
    const initData = w.Telegram?.WebApp?.initData;
    return typeof initData === 'string' && initData.trim().length > 0 ? initData : null;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode ?? 'SIGN_IN');
  }, [isOpen, initialMode]);

  const handleTelegram = async () => {
    if (!telegramInitData || !onTelegramLogin) return;
    try {
      setError(null);
      setLoading(true);
      await Promise.resolve(onTelegramLogin(telegramInitData));
      onClose();
    } catch (err: unknown) {
      setError(formatErrorMessage(err, lang));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setError(null);
      setLoading(true);
      if (mode === 'SIGN_IN') {
        if (!emailOrUsername.trim() || !password.trim()) {
          setError(t.loginRequired);
          setLoading(false);
          return;
        }
        await Promise.resolve(
          onLogin({ emailOrUsername: emailOrUsername.trim(), password: password.trim() })
        );
      } else {
        if (!email.trim() || !username.trim() || !password.trim()) {
          setError(t.signupRequired);
          setLoading(false);
          return;
        }
        await Promise.resolve(
          onSignUp({
            email: email.trim(),
            username: username.trim(),
            password: password.trim(),
          })
        );
      }
      onClose();
    } catch (err: unknown) {
      setError(formatErrorMessage(err, lang));
    } finally {
      setLoading(false);
    }
  };

  const resetAndSwitch = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setLoading(false);
    setEmailOrUsername('');
    setEmail('');
    setUsername('');
    setPassword('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      ></div>
      <div className="relative bg-[#09090b] border border-zinc-800 w-full max-w-sm rounded-xl p-6 shadow-lg animate-in zoom-in-95 duration-200">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-black transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[rgba(36,182,255,1)] focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-zinc-800 data-[state=open]:text-zinc-500"
        >
          <X size={16} className="text-zinc-400" />
      </button>

        <div className="flex flex-col space-y-1.5 text-center sm:text-left mb-6">
            <h2 className="text-lg font-semibold leading-none tracking-tight text-white">
                {modalTitle}
            </h2>
            <p className="text-sm text-zinc-400">
                {modalSubtitle}
            </p>
        </div>

        {telegramInitData && onTelegramLogin && (
          <>
            <button
              type="button"
              onClick={handleTelegram}
              disabled={loading}
              className="w-full h-11 rounded-lg border border-zinc-800 bg-black text-white hover:bg-zinc-950 transition-colors flex items-center justify-center gap-2 font-semibold"
            >
              <Send size={16} className="text-[rgba(36,182,255,1)]" />
              <span>{t.telegramButton}</span>
              <span className="text-xs text-zinc-400 font-medium">{t.telegramHint}</span>
            </button>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-900" />
              <span className="text-[10px] uppercase tracking-wider text-zinc-600">{t.orDivider}</span>
              <div className="h-px flex-1 bg-zinc-900" />
            </div>
          </>
        )}

        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => resetAndSwitch('SIGN_IN')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              mode === 'SIGN_IN'
                ? 'bg-[rgba(36,182,255,1)] text-black'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            {t.loginTab}
          </button>
          <button
            onClick={() => resetAndSwitch('SIGN_UP')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              mode === 'SIGN_UP'
                ? 'bg-[rgba(36,182,255,1)] text-black'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            {t.signupTab}
          </button>
        </div>

        <div className="space-y-4">
          {mode === 'SIGN_IN' ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Mail size={14} /> {t.emailOrUsername}
                </label>
                <input
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  placeholder={t.placeholderEmailOrUsername}
                  className="flex h-10 w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(36,182,255,1)]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Lock size={14} /> {t.password}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.placeholderPassword}
                  className="flex h-10 w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(36,182,255,1)]"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Mail size={14} /> {t.email}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.placeholderEmail}
                  className="flex h-10 w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(36,182,255,1)]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <User size={14} /> {t.username}
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t.placeholderUsername}
                  className="flex h-10 w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(36,182,255,1)]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Lock size={14} /> {t.password}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.placeholderPassword}
                  className="flex h-10 w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(36,182,255,1)]"
                />
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <Button
            fullWidth
            onClick={handleSubmit}
            variant="primary"
            disabled={loading}
          >
            {loading ? t.loadingText : mode === 'SIGN_IN' ? t.loginButton : t.signupButton}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;