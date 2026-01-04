import React, { useMemo, useState } from "react";
import { X, Calendar, Clock, Info, Sparkles } from "lucide-react";
import Button from "./Button";

type MarketCategory = { id: string; labelRu: string; labelEn: string };

type AdminMarketModalProps = {
  isOpen: boolean;
  onClose: () => void;
  lang: "RU" | "EN";
  categories: MarketCategory[];
  categoriesLoading?: boolean;
  onReloadCategories?: () => void;
  onCreate: (payload: {
    titleRu: string;
    titleEn: string;
    description?: string | null;
    closesAt?: string | null;
    expiresAt: string;
    liquidityB?: number;
    categoryId: string;
  }) => Promise<void>;
};

const AdminMarketModal: React.FC<AdminMarketModalProps> = ({
  isOpen,
  onClose,
  lang,
  categories,
  categoriesLoading = false,
  onReloadCategories,
  onCreate,
}) => {
  const [titleRu, setTitleRu] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [description, setDescription] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [liquidityB, setLiquidityB] = useState("50");
  const [categoryId, setCategoryId] = useState<string>("");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = (ru: string, en: string) => (lang === "RU" ? ru : en);

  const selectedCategory = useMemo(() => categories.find((c) => c.id === categoryId) ?? null, [categories, categoryId]);

  const isValid =
    titleRu.trim().length >= 3 &&
    titleEn.trim().length >= 3 &&
    expiresAt.trim().length > 0 &&
    categoryId.trim().length > 0;

  const parsedLiquidityB = useMemo(() => {
    const n = Number(liquidityB);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [liquidityB]);

  if (!isOpen) return null;

  type ErrorLike = string | Error | { message?: string } | null | undefined;

  const getErrorMessage = (error: ErrorLike) => {
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && typeof (error as { message?: string }).message === "string") {
      return String((error as { message?: string }).message);
    }
    return t("Не удалось создать рынок", "Failed to create market");
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setError(null);
    setLoading(true);
    try {
      if (parsedLiquidityB === null) {
        throw new Error(t("Некорректная ликвидность", "Invalid liquidity"));
      }

      await onCreate({
        titleRu: titleRu.trim(),
        titleEn: titleEn.trim(),
        description: description.trim() || null,
        closesAt: closesAt.trim() ? closesAt.trim() : null,
        expiresAt,
        liquidityB: parsedLiquidityB,
        categoryId,
      });
      setTitleRu("");
      setTitleEn("");
      setDescription("");
      setClosesAt("");
      setExpiresAt("");
      setLiquidityB("50");
      setCategoryId("");
      onClose();
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-black border border-zinc-900 w-full max-w-2xl rounded-2xl p-6 shadow-2xl animate-fade-in-up mt-8 sm:mt-0 max-h-[calc(100vh-2rem)] sm:max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white"
          aria-label="Закрыть"
        >
          <X size={22} />
        </button>
        <div className="flex flex-col gap-2 mb-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-300">
            <Sparkles size={14} />
            {t("Новый рынок", "New market")}
          </div>
          <h2 className="text-2xl font-bold text-white">{t("Создать рынок", "Create market")}</h2>
          <p className="text-sm text-neutral-400">
            {t(
              "Категории помогают держать ленту аккуратной, а ликвидность B задаёт чувствительность цены (меньше B — сильнее скачки).",
              "Categories keep the feed organized, and liquidity B controls price sensitivity (lower B = more volatile)."
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 text-sm text-neutral-200">
          <div className="lg:col-span-3 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">{t("Название (RU)", "Title (RU)")}</label>
                <input
                  value={titleRu}
                  onChange={(e) => setTitleRu(e.target.value)}
                  placeholder={t("Например: Bitcoin > $125k к концу 2025?", "e.g. Bitcoin > $125k by end of 2025?")}
                  className="w-full bg-zinc-950/40 border border-zinc-900 rounded-xl p-3 text-white focus:border-zinc-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-400 mb-1">{t("Название (EN)", "Title (EN)")}</label>
                <input
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  placeholder={t("Например: Bitcoin > $125k к концу 2025?", "e.g. Bitcoin > $125k by end of 2025?")}
                  className="w-full bg-zinc-950/40 border border-zinc-900 rounded-xl p-3 text-white focus:border-zinc-700 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">{t("Описание", "Description")}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder={t("Условия разрешения события...", "Resolution criteria...")}
                className="w-full bg-zinc-950/40 border border-zinc-900 rounded-xl p-3 text-white focus:border-zinc-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-2">{t("Категория", "Category")}</label>
              <button
                type="button"
                onClick={() => setCategoryPickerOpen(true)}
                className="w-full h-11 rounded-xl bg-zinc-950/40 border border-zinc-900 px-3 text-left text-sm text-zinc-100 hover:border-zinc-700"
              >
                {categoriesLoading
                  ? t("Загрузка категорий...", "Loading categories...")
                  : selectedCategory
                    ? (lang === "RU" ? selectedCategory.labelRu : selectedCategory.labelEn)
                    : t("Выберите категорию", "Select a category")}
              </button>
              {!categoriesLoading && categories.length === 0 && (
                <button
                  type="button"
                  onClick={() => onReloadCategories?.()}
                  className="mt-2 text-xs text-zinc-400 hover:text-white underline underline-offset-4"
                >
                  {t("Обновить список категорий", "Reload categories")}
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-2">{t("Торги закрываются (UTC)", "Trading closes (UTC)")}</label>
              <div className="flex items-center gap-3 mb-2 text-xs text-neutral-500">
                <Calendar size={14} />
                {t("Можно оставить пустым — будет равно времени окончания", "Optional — defaults to end time")}
              </div>
              <div className="relative">
                <input
                  type="datetime-local"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                  className="w-full bg-zinc-950/40 border border-zinc-900 rounded-xl p-3 text-white focus:border-zinc-700 focus:outline-none"
                />
                <Clock size={16} className="absolute right-3 top-3.5 text-neutral-600" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-2">{t("Окончание события (UTC)", "Event end (UTC)")}</label>
              <div className="flex items-center gap-3 mb-2 text-xs text-neutral-500">
                <Info size={14} />
                {t("После этого времени торги должны быть закрыты, а рынок можно разрешить.", "After this, trading should be closed and the market can be resolved.")}
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {[24, 72, 168].map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => {
                      const iso = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString().slice(0, 16);
                      setExpiresAt(iso);
                      if (!closesAt.trim()) {
                        setClosesAt(iso);
                      }
                    }}
                    className="px-3 py-1 rounded-full border border-zinc-900 text-xs text-zinc-400 hover:text-white hover:border-zinc-700"
                  >
                    {t(
                      `+${hours === 24 ? "1 день" : hours === 72 ? "3 дня" : "7 дней"}`,
                      `+${hours === 24 ? "1 day" : hours === 72 ? "3 days" : "7 days"}`
                    )}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full bg-zinc-950/40 border border-zinc-900 rounded-xl p-3 text-white focus:border-zinc-700 focus:outline-none"
                />
                <Clock size={16} className="absolute right-3 top-3.5 text-neutral-600" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">{t("Ликвидность B (LMSR)", "Liquidity B (LMSR)")}</label>
                <input
                  type="number"
                  min={1}
                  value={liquidityB}
                  onChange={(e) => setLiquidityB(e.target.value)}
                  className="w-full bg-zinc-950/40 border border-zinc-900 rounded-xl p-3 text-white focus:border-zinc-700 focus:outline-none"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                  {t(
                    "B влияет на волатильность цены: меньше B — цена двигается сильнее от каждой ставки.",
                    "B controls volatility: lower B means price moves more per bet."
                  )}
                </p>
              </div>
              <div className="bg-zinc-950/40 border border-zinc-900 rounded-2xl p-4 text-xs text-zinc-500">
                <div className="flex items-center gap-2 text-zinc-300 font-semibold mb-1">
                  <Info size={14} />
                  {t("Зачем это нужно?", "Why do we need this?")}
                </div>
                <p>
                  {t(
                    "Категория и описание нужны, чтобы событие было понятно всем и легко находилось в ленте.",
                    "Category + description help everyone understand the event and discover it in the feed."
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-zinc-950/40 border border-zinc-900 rounded-2xl p-4 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500 mb-1">{t("Предпросмотр (RU)", "Preview (RU)")}</p>
              <h3 className="text-lg font-semibold text-white line-clamp-2">{titleRu || "Название события"}</h3>
              <p className="text-sm text-neutral-400 line-clamp-3">
                {description || t("Короткое описание условия и критериев разрешения.", "Short resolution criteria/description.")}
              </p>
              <div className="mt-4 text-xs text-neutral-500">
                <span className="font-semibold text-white block mb-1">EN:</span>
                <p className="text-neutral-400 line-clamp-2">
                  {titleEn || "Event title in English"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-zinc-950/60 border border-zinc-900 rounded-xl p-3">
                <p className="text-xs text-neutral-500 mb-1">{t("Ликвидность B", "Liquidity B")}</p>
                <p className="text-xl font-mono text-white">{parsedLiquidityB ?? "—"}</p>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-900 rounded-xl p-3">
                <p className="text-xs text-neutral-500 mb-1">{t("Окончание", "Ends")}</p>
                <p className="text-sm text-white">
                  {expiresAt ? new Date(expiresAt).toLocaleString(lang === "RU" ? "ru-RU" : "en-US", { hour12: false }) : "—"}
                </p>
              </div>
            </div>
            <div className="text-xs text-neutral-500">
              {t(
                'Рынок будет сохранён в Supabase и появится в списке после нажатия "Создать".',
                'The market will be saved to Supabase and will appear in the list after you click "Create".'
              )}
            </div>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400 mt-3 text-center">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t("Отмена", "Cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || loading}>
            {loading ? t("Создание...", "Creating...") : t("Создать", "Create")}
          </Button>
        </div>
      </div>

      {categoryPickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setCategoryPickerOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-900 bg-black p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-zinc-100">{t("Выберите категорию", "Select category")}</div>
              <button
                type="button"
                onClick={() => setCategoryPickerOpen(false)}
                className="h-9 w-9 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center text-zinc-300"
                aria-label={t("Закрыть", "Close")}
              >
                <X size={18} />
              </button>
            </div>

            {categoriesLoading ? (
              <div className="py-8 text-center text-sm text-zinc-500">{t("Загрузка...", "Loading...")}</div>
            ) : categories.length === 0 ? (
              <div className="py-6 text-center text-sm text-zinc-500">
                <div className="mb-3">{t("Категории не найдены.", "No categories found.")}</div>
                <Button onClick={() => onReloadCategories?.()}>{t("Обновить", "Reload")}</Button>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto space-y-2">
                {categories.map((c) => {
                  const label = lang === "RU" ? c.labelRu : c.labelEn;
                  const isSelected = c.id === categoryId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCategoryId(c.id);
                        setCategoryPickerOpen(false);
                      }}
                      className={`w-full text-left rounded-xl border px-3 py-3 text-sm transition ${
                        isSelected
                          ? "border-[rgba(36,182,255,1)] bg-[rgba(36,182,255,0.08)] text-zinc-100"
                          : "border-zinc-900 bg-zinc-950/40 text-zinc-200 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{label}</div>
                        </div>
                        {isSelected && (
                          <div className="text-[10px] font-bold uppercase tracking-widest text-[rgba(36,182,255,1)]">
                            {t("Выбрано", "Selected")}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMarketModal;

