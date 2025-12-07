import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import Button from "./Button";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (payload: {
    username?: string;
    displayName?: string;
  }) => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLogin }) => {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");

  const isValid = useMemo(
    () => username.trim().length > 0 || displayName.trim().length > 0,
    [username, displayName]
  );

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!isValid) return;
    onLogin({
      username: username.trim() || undefined,
      displayName: displayName.trim() || undefined,
    });
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

        <h2 className="text-2xl font-bold text-white mb-2">Обновить профиль</h2>
        <p className="text-neutral-400 mb-6 text-sm">
          Telegram ID берём из initData. Уточните ник или имя для профиля.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_username"
              className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-[#BEFF1D] focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">
              Отображаемое имя
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Имя Фамилия"
              className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-[#BEFF1D] focus:outline-none transition-colors"
            />
          </div>
          <Button fullWidth onClick={handleSubmit} disabled={!isValid}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;