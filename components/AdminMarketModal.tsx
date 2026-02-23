import React, { useMemo, useState, useRef, useEffect } from "react";
import { X, Clock, Info, Sparkles, HelpCircle, Image } from "lucide-react";
import Button from "./Button";

type MarketCategory = { id?: string; labelRu?: string; labelEn?: string };

type AdminMarketModalProps = {
  isOpen: boolean;
  onClose: () => void;
  lang: "RU" | "EN";
  categories: MarketCategory[];
  categoriesLoading?: boolean;
  onReloadCategories?: () => void;
  isAdmin?: boolean;
  mode?: "create" | "edit";
  marketId?: string;
  initialValues?: {
    titleEn: string;
    description?: string | null;
    source?: string | null;
    closesAt?: string | null;
    expiresAt: string;
    categoryId: string;
    imageUrl?: string | null;
  };
  onCreate: (payload: {
    titleEn: string;
    description?: string | null;
    source?: string | null;
    closesAt?: string | null;
    expiresAt: string;
    categoryId: string;
    imageUrl?: string | null;
    settlementAssetCode: "VCOIN" | "USDC";
    marketType?: "binary" | "multi_choice";
    options?: Array<{
      title: string;
      iconUrl?: string | null;
      chartColor?: string | null;
      sortOrder?: number;
    }>;
  }) => Promise<void>;
  onUpdate?: (payload: {
    marketId: string;
    titleEn: string;
    description?: string | null;
    source?: string | null;
    closesAt?: string | null;
    expiresAt: string;
    categoryId: string;
    imageUrl?: string | null;
  }) => Promise<void>;
};

const AdminMarketModal: React.FC<AdminMarketModalProps> = ({
  isOpen,
  onClose,
  lang,
  categories,
  categoriesLoading = false,
  onReloadCategories,
  isAdmin = false,
  mode = "create",
  marketId,
  initialValues,
  onCreate,
  onUpdate,
}) => {
  const [titleEn, setTitleEn] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [settlementAssetCode, setSettlementAssetCode] = useState<"VCOIN" | "USDC">("VCOIN");
  const [marketType, setMarketType] = useState<"binary" | "multi_choice">("binary");
  const [options, setOptions] = useState<Array<{ title: string; iconFile: File | null; iconUrl: string | null; chartColor: string | null }>>([
    { title: "", iconFile: null, iconUrl: null, chartColor: null },
    { title: "", iconFile: null, iconUrl: null, chartColor: null },
  ]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === "edit" && initialValues) {
      setTitleEn(initialValues.titleEn ?? "");
      setDescription(initialValues.description ?? "");
      setSource(initialValues.source ?? "");
      setExpiresAt(initialValues.expiresAt ?? "");
      setCategoryId(initialValues.categoryId ?? "");
      setImageUrl(initialValues.imageUrl ?? null);
      setImageFile(null);
      setSettlementAssetCode("VCOIN");
      setMarketType("binary");
    } else if (mode === "create") {
      setTitleEn("");
      setDescription("");
      setSource("");
      setExpiresAt("");
      setCategoryId("");
      setImageFile(null);
      setImageUrl(null);
      setSettlementAssetCode("VCOIN");
      setMarketType("binary");
      setOptions([
        { title: "", iconFile: null, iconUrl: null, chartColor: null },
        { title: "", iconFile: null, iconUrl: null, chartColor: null },
      ]);
    }
  }, [isOpen, mode, initialValues]);

  const extractColorFromFile = async (file: File): Promise<string | null> => {
    try {
      const imageUrl = URL.createObjectURL(file);
      const color = await new Promise<string | null>((resolve) => {
        const img = new window.Image();
        img.decoding = "async";
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            const size = 24;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) {
              resolve(null);
              return;
            }
            ctx.drawImage(img, 0, 0, size, size);
            const data = ctx.getImageData(0, 0, size, size).data;
            let r = 0;
            let g = 0;
            let b = 0;
            let count = 0;
            for (let i = 0; i < data.length; i += 4) {
              const alpha = data[i + 3] ?? 0;
              if (alpha < 24) continue;
              r += data[i] ?? 0;
              g += data[i + 1] ?? 0;
              b += data[i + 2] ?? 0;
              count += 1;
            }
            if (count === 0) {
              resolve(null);
              return;
            }
            r = Math.round(r / count);
            g = Math.round(g / count);
            b = Math.round(b / count);
            const toHex = (v: number) => v.toString(16).padStart(2, "0");
            resolve(`#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase());
          } catch {
            resolve(null);
          } finally {
            URL.revokeObjectURL(imageUrl);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(imageUrl);
          resolve(null);
        };
        img.src = imageUrl;
      });
      return color;
    } catch {
      return null;
    }
  };

  const t = (ru: string, en: string) => (lang === "RU" ? ru : en);

  const categoriesStrict = useMemo(
    () =>
      categories.filter(
        (c): c is { id: string; labelRu: string; labelEn: string } =>
          typeof c.id === "string" &&
          c.id.trim().length > 0 &&
          typeof c.labelRu === "string" &&
          typeof c.labelEn === "string"
      ),
    [categories]
  );

  const selectedCategory = useMemo(
    () => categoriesStrict.find((c) => c.id === categoryId) ?? null,
    [categoriesStrict, categoryId]
  );

  const validationIssues = useMemo(() => {
    const issues: string[] = [];

    if (titleEn.trim().length < 3) {
      issues.push(t("Название — минимум 3 символа", "Title — at least 3 characters"));
    }

    const desc = description.trim();
    if (desc.length > 0 && desc.length < 3) {
      issues.push(t("Описание — минимум 3 символа", "Description — at least 3 characters"));
    }

    const src = source.trim();
    if (src.length > 0 && src.length < 3) {
      issues.push(t("Источник — минимум 3 символа", "Source — at least 3 characters"));
    }

    const expiresAtMs = Date.parse(expiresAt);
    if (!expiresAt.trim()) {
      issues.push(t("Окончание события — обязательно", "Event end time — required"));
    } else if (!Number.isFinite(expiresAtMs)) {
      issues.push(t("Окончание события — некорректная дата", "Event end time — invalid date"));
    } else if (expiresAtMs < Date.now()) {
      issues.push(t("Окончание события — должно быть в будущем", "Event end time — must be in the future"));
    }

    if (categoriesLoading) {
      issues.push(t("Категории загружаются — подождите", "Categories are loading — please wait"));
    } else if (categoriesStrict.length === 0) {
      issues.push(t("Категории не загружены — обновите список", "Categories not loaded — reload the list"));
    }

    if (!categoryId.trim()) {
      issues.push(t("Категория — обязательна", "Category — required"));
    } else if (categoriesStrict.length > 0 && !categoriesStrict.some((c) => c.id === categoryId)) {
      issues.push(t("Выбрана некорректная категория", "Selected category is invalid"));
    }

    if (marketType === "multi_choice") {
      const normalizedTitles = options.map((o) => o.title.trim()).filter((v) => v.length > 0);
      if (normalizedTitles.length < 2) {
        issues.push(t("Минимум 2 варианта ответа", "At least 2 answer options are required"));
      }
      const uniqueCount = new Set(normalizedTitles.map((v) => v.toLowerCase())).size;
      if (uniqueCount !== normalizedTitles.length) {
        issues.push(t("Варианты ответа должны быть уникальными", "Answer options must be unique"));
      }
    }

    return issues;
  }, [titleEn, description, source, expiresAt, categoryId, categoriesLoading, categoriesStrict, marketType, options, t]);

  const canSubmit = validationIssues.length === 0 && !loading;

  if (!isOpen) return null;

  type ZodIssueLike = { message?: string; path?: Array<string | number> };
  type ErrorLike =
    | string
    | Error
    | { message?: string; data?: { zodError?: { issues?: ZodIssueLike[] } } }
    | null
    | undefined;

  const getErrorMessage = (error: ErrorLike): string => {
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object") {
      if ("message" in error && typeof error.message === "string") {
        return error.message;
      }
      // Check for Zod validation errors in tRPC error structure
      if ("data" in error && error.data && typeof error.data === "object" && "zodError" in error.data) {
        const zodError = error.data.zodError;
        if (zodError && typeof zodError === "object" && "issues" in zodError && Array.isArray(zodError.issues)) {
          const issues = (zodError.issues ?? []) as ZodIssueLike[];
          if (issues.length > 0) {
            const firstIssue = issues[0];
            if (firstIssue.message) {
              return firstIssue.message;
            }
          }
        }
      }
    }
    return mode === "edit"
      ? t("Не удалось обновить рынок", "Failed to update market")
      : t("Не удалось создать рынок", "Failed to create market");
  };

  const handleSubmit = async () => {
    if (validationIssues.length > 0) {
      setValidationOpen(true);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      let finalImageUrl: string | null = imageUrl;

      // Upload image if a file was selected
      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        const uploadResp = await fetch("/api/market-image/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = (await uploadResp.json()) as { imageUrl?: string; error?: string };
        if (!uploadResp.ok || !uploadData.imageUrl) {
          throw new Error(uploadData.error || "UPLOAD_FAILED");
        }
        finalImageUrl = uploadData.imageUrl;
      }

      let preparedOptions: Array<{ title: string; iconUrl?: string | null; chartColor?: string | null; sortOrder?: number }> = [];
      if (marketType === "multi_choice") {
        preparedOptions = [];
        for (let idx = 0; idx < options.length; idx += 1) {
          const o = options[idx];
          const title = o.title.trim();
          if (!title) continue;
          let finalOptionIcon = o.iconUrl;
          let finalChartColor = o.chartColor;
          if (o.iconFile) {
            finalChartColor = (await extractColorFromFile(o.iconFile)) ?? finalChartColor;
            const fd = new FormData();
            fd.append("file", o.iconFile);
            const resp = await fetch("/api/market-image/upload", { method: "POST", body: fd });
            const body = (await resp.json()) as { imageUrl?: string; error?: string };
            if (!resp.ok || !body.imageUrl) {
              throw new Error(body.error || "OPTION_ICON_UPLOAD_FAILED");
            }
            finalOptionIcon = body.imageUrl;
          }
          preparedOptions.push({
            title,
            iconUrl: finalOptionIcon,
            chartColor: finalChartColor,
            sortOrder: idx,
          });
        }
      }

      const payload = {
        titleEn: titleEn.trim(),
        description: description.trim() || null,
        source: source.trim() || null,
        expiresAt,
        categoryId,
        imageUrl: finalImageUrl,
        settlementAssetCode: isAdmin ? settlementAssetCode : "VCOIN",
        marketType,
        options: preparedOptions,
      };

      if (mode === "edit") {
        if (!marketId || !onUpdate) {
          throw new Error("EDIT_NOT_CONFIGURED");
        }
        await onUpdate({ ...payload, marketId });
      } else {
        await onCreate(payload);
        setTitleEn("");
        setDescription("");
        setSource("");
        setExpiresAt("");
        setCategoryId("");
        setImageFile(null);
        setImageUrl(null);
        setMarketType("binary");
        setOptions([
          { title: "", iconFile: null, iconUrl: null, chartColor: null },
          { title: "", iconFile: null, iconUrl: null, chartColor: null },
        ]);
      }
      onClose();
    } catch (error) {
      console.error('Market submit error:', error);
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
            {mode === "edit" ? t("Редактирование", "Editing") : t("Новый рынок", "New market")}
          </div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-bold text-white">
              {mode === "edit" ? t("Изменить рынок", "Edit market") : t("Создать рынок", "Create market")}
            </h2>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="h-9 w-9 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center text-zinc-300"
              aria-label={t("Подсказка", "Help")}
              title={t("Подсказка", "Help")}
            >
              <HelpCircle size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 text-sm text-neutral-200">
          <div className="lg:col-span-3 space-y-4">
            <div>
              <label className="block text-xs font-bold text-white mb-1">{t("Название", "Title")}</label>
              <input
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder={t("Например: Bitcoin > $125k к концу 2025?", "e.g. Bitcoin > $125k by end of 2025?")}
                className="w-full bg-zinc-950/40 border border-zinc-900 rounded-xl p-3 text-white focus:border-zinc-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white mb-1">{t("Описание", "Description")}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder={t("Условия разрешения события...", "Resolution criteria...")}
                className="w-full bg-zinc-950/40 border border-zinc-900 rounded-xl p-3 text-white focus:border-zinc-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white mb-1">{t("Источник (обязательно)", "Source (required)")}</label>
              <div className="text-[11px] text-zinc-500 mb-2">
                {t(
                  "Укажите, где будет подтверждаться исход (например: Twitter, Telegram-канал, сайт).",
                  "Where will the outcome be verified? (e.g., Twitter, Telegram channel, website)."
                )}
              </div>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={t("Например: https://t.me/...", "e.g. https://t.me/...")}
                className="w-full bg-zinc-950/40 border border-zinc-900 rounded-xl p-3 text-white focus:border-zinc-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-white mb-2">{t("Изображение", "Image")}</label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setImageFile(file);
                  setImageUrl(null); // Clear URL when file is selected
                }}
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={loading}
                className="w-full h-11 rounded-xl bg-zinc-950/40 border border-zinc-900 px-3 text-left text-sm text-zinc-100 hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Image size={16} />
                <span>{t("Загрузить изображение", "Upload image")}</span>
              </button>
              {imageFile && (
                <div className="mt-2 text-xs text-zinc-500">
                  {t("Выбран файл:", "Selected file:")} {imageFile.name}
                </div>
              )}
              {imagePreviewUrl && (
                <div className="mt-3 rounded-xl overflow-hidden border border-zinc-900 bg-zinc-950/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreviewUrl}
                    alt={t("Превью изображения", "Image preview")}
                    className="w-full h-auto max-h-48 object-cover"
                  />
                </div>
              )}
              {!imagePreviewUrl && imageUrl && (
                <div className="mt-3 rounded-xl overflow-hidden border border-zinc-900 bg-zinc-950/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={t("Превью изображения", "Image preview")}
                    className="w-full h-auto max-h-48 object-cover"
                  />
                </div>
              )}
              <p className="mt-2 text-xs text-zinc-500">
                {t("Опционально: загрузите изображение для рынка", "Optional: upload an image for the market")}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-white mb-2">{t("Категория", "Category")}</label>
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
              {!categoriesLoading && categoriesStrict.length === 0 && (
                <button
                  type="button"
                  onClick={() => onReloadCategories?.()}
                  className="mt-2 text-xs text-zinc-400 hover:text-white underline underline-offset-4"
                >
                  {t("Обновить список категорий", "Reload categories")}
                </button>
              )}
            </div>

            {mode === "create" && isAdmin && (
              <div>
                <label className="block text-xs font-bold text-white mb-2">
                  {t("Актив расчёта", "Settlement asset")}
                </label>
                <div className="flex items-center gap-2">
                  {(["VCOIN", "USDC"] as const).map((asset) => (
                    <button
                      key={asset}
                      type="button"
                      onClick={() => setSettlementAssetCode(asset)}
                      className={`flex-1 h-10 rounded-xl border text-sm font-semibold transition ${
                        settlementAssetCode === asset
                          ? "border-[rgba(245,68,166,1)] text-white bg-[rgba(245,68,166,0.10)]"
                          : "border-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-700"
                      }`}
                    >
                      {asset}
                    </button>
                  ))}
                </div>
                {settlementAssetCode === "USDC" && (
                  <p className="mt-2 text-xs text-zinc-500">
                    {t(
                      "USDC сейчас в тестовом режиме — функция в разработке.",
                      "USDC is in test mode — this feature is still in development."
                    )}
                  </p>
                )}
              </div>
            )}
            {mode === "create" && (
              <div>
                <label className="block text-xs font-bold text-white mb-2">{t("Тип рынка", "Market type")}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMarketType("binary")}
                    className={`h-10 rounded-xl border text-sm font-semibold ${
                      marketType === "binary"
                        ? "border-[rgba(245,68,166,1)] text-white bg-[rgba(245,68,166,0.10)]"
                        : "border-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-700"
                    }`}
                  >
                    {t("Да / Нет", "Yes / No")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarketType("multi_choice")}
                    className={`h-10 rounded-xl border text-sm font-semibold ${
                      marketType === "multi_choice"
                        ? "border-[rgba(245,68,166,1)] text-white bg-[rgba(245,68,166,0.10)]"
                        : "border-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-700"
                    }`}
                  >
                    {t("Много вариантов", "Multiple options")}
                  </button>
                </div>
              </div>
            )}

            {mode === "create" && marketType === "multi_choice" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-white">{t("Варианты ответа", "Answer options")}</label>
                  <button
                    type="button"
                    onClick={() => setOptions((curr) => [...curr, { title: "", iconFile: null, iconUrl: null, chartColor: null }])}
                    className="text-xs text-zinc-300 hover:text-white"
                  >
                    {t("+ Добавить", "+ Add")}
                  </button>
                </div>
                {options.map((o, idx) => (
                  <div key={`option-${idx}`} className="rounded-xl border border-zinc-900 p-3 space-y-2">
                    <input
                      value={o.title}
                      onChange={(e) =>
                        setOptions((curr) => curr.map((it, i) => (i === idx ? { ...it, title: e.target.value } : it)))
                      }
                      placeholder={t(`Вариант ${idx + 1}`, `Option ${idx + 1}`)}
                      className="w-full bg-zinc-950/40 border border-zinc-900 rounded-xl p-2 text-white focus:border-zinc-700 focus:outline-none"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setOptions((curr) => curr.map((it, i) => (i === idx ? { ...it, iconFile: file, chartColor: null } : it)));
                      }}
                      className="w-full text-xs text-zinc-400"
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setOptions((curr) => curr.filter((_, i) => i !== idx))}
                        className="text-xs text-zinc-500 hover:text-red-400"
                      >
                        {t("Удалить вариант", "Remove option")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-white mb-2">{t("Окончание события (UTC)", "Event end (UTC)")}</label>
              <div className="flex items-center gap-3 mb-2 text-xs text-neutral-500">
                <Info size={14} />
                {t("После этого времени торги закрываются, а рынок можно разрешить.", "After this time, trading closes and the market can be resolved.")}
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {[24, 72, 168].map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => {
                      const iso = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString().slice(0, 16);
                      setExpiresAt(iso);
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

          </div>

          <div className="lg:col-span-2 bg-zinc-950/40 border border-zinc-900 rounded-2xl p-4 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500 mb-1">{t("Предпросмотр", "Preview")}</p>
              <h3 className="text-lg font-semibold text-white line-clamp-2">{titleEn || "Event title"}</h3>
              <p className="text-sm text-neutral-400 line-clamp-3">
                {description || t("Короткое описание условия и критериев разрешения.", "Short resolution criteria/description.")}
              </p>
            </div>
            <div className="bg-zinc-950/60 border border-zinc-900 rounded-xl p-3">
              <p className="text-xs text-neutral-500 mb-1">{t("Окончание", "Ends")}</p>
              <p className="text-sm text-white">
                {expiresAt ? new Date(expiresAt).toLocaleString(lang === "RU" ? "ru-RU" : "en-US", { hour12: false }) : "—"}
              </p>
            </div>
            {/* (explanations moved into the help popup) */}
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400 mt-3 text-center">{error}</p>
        )}

        <div className="mt-6 pt-4 border-t border-zinc-900 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t("Отмена", "Cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            aria-disabled={!canSubmit}
            className={!canSubmit ? "opacity-60 hover:opacity-60" : ""}
          >
            {loading
              ? mode === "edit"
                ? t("Сохранение...", "Saving...")
                : t("Создание...", "Creating...")
              : mode === "edit"
              ? t("Сохранить", "Save")
              : t("Создать", "Create")}
          </Button>
        </div>
      </div>

      {validationOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setValidationOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-900 bg-black p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-sm font-semibold text-zinc-100">
                {t("Что нужно заполнить", "What’s missing")}
              </div>
              <button
                type="button"
                onClick={() => setValidationOpen(false)}
                className="h-9 w-9 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center text-zinc-300"
                aria-label={t("Закрыть", "Close")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="text-sm text-zinc-300">
              <ul className="space-y-2">
                {validationIssues.map((msg) => (
                  <li key={msg} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[rgba(245,68,166,1)] flex-shrink-0" />
                    <span>{msg}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setValidationOpen(false)}>
                {t("Понятно", "Got it")}
              </Button>
            </div>
          </div>
        </div>
      )}

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
            ) : categoriesStrict.length === 0 ? (
              <div className="py-6 text-center text-sm text-zinc-500">
                <div className="mb-3">{t("Категории не найдены.", "No categories found.")}</div>
                <Button onClick={() => onReloadCategories?.()}>{t("Обновить", "Reload")}</Button>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto space-y-2">
                {categoriesStrict.map((c) => {
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
                          ? "border-[rgba(245,68,166,1)] bg-black text-[rgba(245,68,166,1)] hover:bg-[rgba(245,68,166,0.10)]"
                          : "border-zinc-900 bg-zinc-950/40 text-zinc-200 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{label}</div>
                        </div>
                        {isSelected && (
                          <div className="text-[10px] font-bold uppercase tracking-widest text-white">
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

      {helpOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setHelpOpen(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-900 bg-black p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-sm font-semibold text-zinc-100">
                {t("Подсказка", "Help")}
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="h-9 w-9 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center text-zinc-300"
                aria-label={t("Закрыть", "Close")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-sm text-zinc-300">
              <div className="rounded-xl border border-zinc-900 bg-zinc-950/30 p-4">
                <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">
                  {t("Зачем категории?", "Why categories?")}
                </div>
                <p className="text-zinc-300">
                  {t(
                    "Категории помогают держать ленту событий аккуратной и улучшают поиск.",
                    "Categories keep the feed organized and improve discovery/search."
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMarketModal;

