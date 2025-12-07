import React from "react";
import { X } from "lucide-react";
import Button from "./Button";

type ProfileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  email?: string;
  username?: string;
  balance?: number;
  onLogout: () => void;
};

const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  email,
  username,
  balance,
  onLogout,
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-neutral-900 border border-neutral-700 w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-fade-in-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white"
          aria-label="Закрыть"
        >
          <X size={22} />
        </button>
        <h2 className="text-xl font-bold text-white mb-4">Профиль</h2>
        <div className="space-y-3 text-sm text-neutral-300">
          <div className="flex justify-between">
            <span className="text-neutral-500">Username</span>
            <span className="font-semibold">{username || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Email</span>
            <span className="font-semibold">{email || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Баланс</span>
            <span className="font-semibold text-[#BEFF1D]">
              {balance !== undefined ? `$${balance.toFixed(2)}` : "—"}
            </span>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
          <Button variant="secondary" onClick={onLogout}>
            Выйти
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;

