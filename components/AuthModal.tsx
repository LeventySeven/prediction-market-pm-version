import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import Button from "./Button";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignUp: (payload: {
    email: string;
    username: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
  onLogin: (payload: { emailOrUsername: string; password: string }) => Promise<void>;
}

const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSignUp,
  onLogin,
}) => {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = useMemo(() => {
    if (mode === "signup") {
      return (
        email.trim().length > 3 &&
        username.trim().length > 2 &&
        password.trim().length >= 8
      );
    }
    return password.trim().length >= 8 && (email.trim().length > 0 || username.trim().length > 0);
  }, [mode, email, username, password]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!isValid || loading) return;
    setError(null);
    setLoading(true);
    const action =
      mode === "signup"
        ? onSignUp({
            email: email.trim(),
            username: username.trim(),
            password: password.trim(),
            displayName: displayName.trim() || undefined,
          })
        : onLogin({
            emailOrUsername: email.trim() || username.trim(),
            password: password.trim(),
          });

    Promise.resolve(action)
      .then(() => {
        setEmail("");
        setUsername("");
        setDisplayName("");
        setPassword("");
        onClose();
      })
      .catch((err) => setError(err?.message || "Не удалось выполнить действие"))
      .finally(() => setLoading(false));
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

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white">
            {mode === "signup" ? "Регистрация" : "Вход"}
          </h2>
          <button
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
            className="text-xs text-[#BEFF1D] hover:underline"
          >
            {mode === "signup" ? "У меня уже есть аккаунт" : "Создать аккаунт"}
          </button>
        </div>
        <p className="text-neutral-400 mb-6 text-sm">
          {mode === "signup"
            ? "Введите email, имя пользователя и пароль."
            : "Войдите по email или username и паролю."}
        </p>

        <div className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-[#BEFF1D] focus:outline-none transition-colors"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">
              {mode === "signup" ? "Username" : "Email или Username"}
            </label>
            <input
              value={mode === "signup" ? username : email || username}
              onChange={(e) =>
                mode === "signup"
                  ? setUsername(e.target.value)
                  : (setEmail(e.target.value), setUsername(e.target.value))
              }
              placeholder={mode === "signup" ? "your_username" : "you@example.com или username"}
              className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-[#BEFF1D] focus:outline-none transition-colors"
            />
          </div>
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">
                Отображаемое имя (опц.)
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Имя Фамилия"
                className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-[#BEFF1D] focus:outline-none transition-colors"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 8 символов"
              className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-[#BEFF1D] focus:outline-none transition-colors"
            />
          </div>
          <Button fullWidth onClick={handleSubmit} disabled={!isValid || loading}>
            {loading ? "Сохранение..." : mode === "signup" ? "Создать аккаунт" : "Войти"}
          </Button>
          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;