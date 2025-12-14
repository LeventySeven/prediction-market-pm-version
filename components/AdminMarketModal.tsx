import React, { useMemo, useState } from "react";
import { X, Calendar, Clock, Info } from "lucide-react";
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

  const numericYes = Number(poolYes) || 0;
  const numericNo = Number(poolNo) || 0;

  const isValid = title.trim().length >= 3 && expiresAt.trim().length > 0;

  const totalPool = useMemo(() => {
    const sum = numericYes + numericNo;
    return sum < 0 ? 0 : sum;
  }, [numericYes, numericNo]);

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
        poolYes: numericYes,
        poolNo: numericNo,
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
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0d0d10] border border-neutral-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl animate-fade-in-up mt-8 sm:mt-0 max-h-[calc(100vh-2rem)] sm:max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white"
          aria-label="Закрыть"
        >
          <X size={22} />
        </button>
        <div className="flex flex-col gap-2 mb-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#BEFF1D]">
            <Info size={14} />
            Только для администраторов
          </div>
          <h2 className="text-2xl font-bold text-white">Создать рынок</h2>
          <p className="text-sm text-neutral-400">
            Если ваша учетная запись в Supabase имеет флаг <code className="text-[#BEFF1D]">is_admin</code>, вы можете
            публиковать события прямо отсюда. Новые рынки появляются на главном экране сразу после создания.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 text-sm text-neutral-200">
          <div className="lg:col-span-3 space-y-4">
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
                rows={4}
                placeholder="Условия разрешения события..."
                className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-[#BEFF1D] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-2">
                Дата/время окончания (UTC)
              </label>
              <div className="flex items-center gap-3 mb-2 text-xs text-neutral-500">
                <Calendar size={14} />
                Выберите точное время или используйте пресеты
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {[24, 72, 168].map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => {
                      const iso = new Date(Date.now() + hours * 60 * 60 * 1000)
                        .toISOString()
                        .slice(0, 16);
                      setExpiresAt(iso);
                    }}
                    className="px-3 py-1 rounded-full border border-neutral-800 text-xs text-neutral-400 hover:text-white hover:border-[#BEFF1D]"
                  >
                    +{hours === 24 ? "1 день" : hours === 72 ? "3 дня" : "7 дней"}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-[#BEFF1D] focus:outline-none"
                />
                <Clock size={16} className="absolute right-3 top-3.5 text-neutral-600" />
              </div>
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

          <div className="lg:col-span-2 bg-black/40 border border-neutral-800 rounded-2xl p-4 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500 mb-1">Предпросмотр</p>
              <h3 className="text-lg font-semibold text-white line-clamp-2">{title || "Название события"}</h3>
              <p className="text-sm text-neutral-400 line-clamp-3">
                {description || "Короткое описание условия и критериев разрешения."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-3">
                <p className="text-xs text-neutral-500 mb-1">Общий пул</p>
                <p className="text-xl font-mono text-white">${totalPool.toFixed(2)}</p>
              </div>
              <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-3">
                <p className="text-xs text-neutral-500 mb-1">Закрытие</p>
                <p className="text-sm text-white">
                  {expiresAt ? new Date(expiresAt).toLocaleString("ru-RU", { hour12: false }) : "—"}
                </p>
              </div>
            </div>
            <div className="text-xs text-neutral-500">
              Все значения автоматически сохраняются в Supabase и становятся доступны пользователям после нажатия <span className="text-[#BEFF1D] font-semibold">"Создать"</span>.
            </div>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400 mt-3 text-center">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-3">
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

