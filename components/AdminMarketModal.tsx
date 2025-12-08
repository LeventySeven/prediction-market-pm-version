import React, { useState, useMemo } from "react";
import { X } from "lucide-react";
import Button from "./Button";

type AdminMarketModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (payload: {
    title: string;
    description?: string | null;
    expiresAt: string;
    poolYes?: number;
    poolNo?: number;
  }) => Promise<void>;
};

const AdminMarketModal: React.FC<AdminMarketModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [poolYes, setPoolYes] = useState("0");
  const [poolNo, setPoolNo] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = useMemo(
    () => title.trim().length >= 3 && expiresAt.trim().length > 0,
    [title, expiresAt]
  );

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!isValid) return;
    setError(null);
    setLoading(true);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || null,
        expiresAt,
        poolYes: Number(poolYes) || 0,
        poolNo: Number(poolNo) || 0,
      });
      setTitle("");
      setDescription("");
      setExpiresAt("");
      setPoolYes("0");
      setPoolNo("0");
      onClose();
    } catch (err: any) {
      setError(err?.message || "Не удалось создать рынок");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-neutral-900 border border-neutral-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl animate-fade-in-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white"
          aria-label="Закрыть"
        >
          <X size={22} />
        </button>
        <h2 className="text-xl font-bold text-white mb-3">Создать рынок</h2>
        <p className="text-sm text-neutral-400 mb-4">
          Заполните данные события. Текущие пулы можно оставить 0.
        </p>

        <div className="space-y-3 text-sm text-neutral-200">
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Название</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Bitcoin > $125k к концу 2025?"
              className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-[#BEFF1D] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Условия разрешения события..."
              className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-[#BEFF1D] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">
              Дата/время окончания (UTC)
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-[#BEFF1D] focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Пул YES</label>
              <input
                type="number"
                value={poolYes}
                onChange={(e) => setPoolYes(e.target.value)}
                className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-[#BEFF1D] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Пул NO</label>
              <input
                type="number"
                value={poolNo}
                onChange={(e) => setPoolNo(e.target.value)}
                className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-[#BEFF1D] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400 mt-3 text-center">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || loading}>
            {loading ? "Создание..." : "Создать"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminMarketModal;

