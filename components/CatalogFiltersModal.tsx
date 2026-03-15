'use client';

import { X } from "lucide-react";

type CatalogSort =
  | "ENDING_SOON"
  | "CREATED_DESC"
  | "CREATED_ASC"
  | "VOLUME_DESC"
  | "VOLUME_ASC"
  | "CATEGORY_ASC"
  | "CATEGORY_DESC";

type CatalogStatus = "ALL" | "ONGOING" | "ENDED";
type CatalogTimeFilter = "ANY" | "HOUR" | "DAY" | "WEEK";

export type CatalogFiltersModalProps = {
  lang: "RU" | "EN";
  catalogStatus: CatalogStatus;
  catalogTimeFilter: CatalogTimeFilter;
  catalogSort: CatalogSort;
  onStatusChange: (status: CatalogStatus) => void;
  onTimeFilterChange: (filter: CatalogTimeFilter) => void;
  onSortChange: (sort: CatalogSort) => void;
  onReset: () => void;
  onClose: () => void;
};

export default function CatalogFiltersModal({
  lang,
  catalogStatus,
  catalogTimeFilter,
  catalogSort,
  onStatusChange,
  onTimeFilterChange,
  onSortChange,
  onReset,
  onClose,
}: CatalogFiltersModalProps) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4" data-swipe-ignore="true">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-900 bg-black p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="text-sm font-semibold text-zinc-100">
            {lang === "RU" ? "Фильтры каталога" : "Catalog filters"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center text-zinc-300"
            aria-label={lang === "RU" ? "Закрыть" : "Close"}
          >
            <X size={16} />
          </button>
        </div>

        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          {lang === "RU" ? "Статус" : "Status"}
        </div>
        <div role="radiogroup" className="space-y-2 mb-4">
          {([
            { id: "ALL" as const, labelRu: "Все", labelEn: "All" },
            { id: "ONGOING" as const, labelRu: "Текущие", labelEn: "Ongoing" },
            { id: "ENDED" as const, labelRu: "Завершённые", labelEn: "Ended" },
          ]).map((opt) => {
            const selected = catalogStatus === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onStatusChange(opt.id)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                  selected
                    ? "border-[rgba(245,68,166,1)] bg-[rgba(245,68,166,0.10)] text-white"
                    : "border-zinc-900 bg-zinc-950/30 text-zinc-300 hover:bg-zinc-950/50"
                }`}
              >
                <div className="text-sm font-semibold">{lang === "RU" ? opt.labelRu : opt.labelEn}</div>
              </button>
            );
          })}
        </div>

        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          {lang === "RU" ? "Время" : "Time"}
        </div>
        <div role="radiogroup" className="space-y-2 mb-4">
          {([
            { id: "ANY" as const, labelRu: "Любое", labelEn: "Any" },
            { id: "HOUR" as const, labelRu: "Закончится за 1 час", labelEn: "Ends in 1 hour" },
            { id: "DAY" as const, labelRu: "Закончится за 24 часа", labelEn: "Ends in 24 hours" },
            { id: "WEEK" as const, labelRu: "Закончится за 7 дней", labelEn: "Ends in 7 days" },
          ]).map((opt) => {
            const selected = catalogTimeFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onTimeFilterChange(opt.id)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                  selected
                    ? "border-[rgba(245,68,166,1)] bg-[rgba(245,68,166,0.10)] text-white"
                    : "border-zinc-900 bg-zinc-950/30 text-zinc-300 hover:bg-zinc-950/50"
                }`}
              >
                <div className="text-sm font-semibold">{lang === "RU" ? opt.labelRu : opt.labelEn}</div>
              </button>
            );
          })}
        </div>

        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          {lang === "RU" ? "Сортировка" : "Sort"}
        </div>

        <div role="radiogroup" className="space-y-2">
          {([
            { id: "CREATED_DESC" as const, labelRu: "Новые события", labelEn: "New events first" },
            { id: "CREATED_ASC" as const, labelRu: "Старые события", labelEn: "Old events first" },
            { id: "ENDING_SOON" as const, labelRu: "Скоро закончится", labelEn: "Will end soon" },
            { id: "VOLUME_DESC" as const, labelRu: "Объём: по убыванию", labelEn: "Volume: descending" },
            { id: "VOLUME_ASC" as const, labelRu: "Объём: по возрастанию", labelEn: "Volume: ascending" },
            { id: "CATEGORY_ASC" as const, labelRu: "Категория: A → Z", labelEn: "Category: A → Z" },
            { id: "CATEGORY_DESC" as const, labelRu: "Категория: Z → A", labelEn: "Category: Z → A" },
          ]).map((opt) => {
            const selected = catalogSort === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSortChange(opt.id)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                  selected
                    ? "border-[rgba(245,68,166,1)] bg-[rgba(245,68,166,0.10)] text-white"
                    : "border-zinc-900 bg-zinc-950/30 text-zinc-300 hover:bg-zinc-950/50"
                }`}
              >
                <div className="text-sm font-semibold">{lang === "RU" ? opt.labelRu : opt.labelEn}</div>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onReset}
          className="mt-3 w-full h-10 rounded-full border border-zinc-800 bg-zinc-950/40 hover:bg-zinc-950/60 text-zinc-200 text-sm font-semibold transition-colors"
        >
          {lang === "RU" ? "Сбросить фильтры" : "Reset filters"}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full h-11 rounded-full bg-[rgba(245,68,166,1)] hover:bg-[rgba(245,68,166,0.90)] text-white font-semibold transition-colors"
        >
          {lang === "RU" ? "Готово" : "Done"}
        </button>
      </div>
    </div>
  );
}
