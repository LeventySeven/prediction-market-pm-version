import { z } from "zod";

/**
 * Single source of truth for the app-owned AI taxonomy.
 * Every tag id, label, and display order derives from this registry.
 * Classifier JSON schema, catalog chips, community validation, and
 * market payload types all read from here – nothing else.
 */

export const TAXONOMY_TAGS = [
  { id: "crypto", labelRu: "Крипто", labelEn: "Crypto", order: 0 },
  { id: "ai", labelRu: "ИИ", labelEn: "AI", order: 1 },
  { id: "technology", labelRu: "Технологии", labelEn: "Technology", order: 2 },
  { id: "politics", labelRu: "Политика", labelEn: "Politics", order: 3 },
  { id: "elections", labelRu: "Выборы", labelEn: "Elections", order: 4 },
  { id: "geopolitics", labelRu: "Геополитика", labelEn: "Geopolitics", order: 5 },
  { id: "stocks", labelRu: "Акции", labelEn: "Stocks", order: 6 },
  { id: "finance", labelRu: "Финансы", labelEn: "Finance", order: 7 },
  { id: "macroeconomics", labelRu: "Макро", labelEn: "Macro", order: 8 },
  { id: "business", labelRu: "Бизнес", labelEn: "Business", order: 9 },
  { id: "sports", labelRu: "Спорт", labelEn: "Sports", order: 10 },
  { id: "entertainment", labelRu: "Развлечения", labelEn: "Entertainment", order: 11 },
  { id: "culture", labelRu: "Культура", labelEn: "Culture", order: 12 },
  { id: "science", labelRu: "Наука", labelEn: "Science", order: 13 },
  { id: "health", labelRu: "Здоровье", labelEn: "Health", order: 14 },
  { id: "energy", labelRu: "Энергетика", labelEn: "Energy", order: 15 },
  { id: "regulation", labelRu: "Регулирование", labelEn: "Regulation", order: 16 },
  { id: "legal", labelRu: "Право", labelEn: "Legal", order: 17 },
  { id: "weather", labelRu: "Погода", labelEn: "Weather", order: 18 },
  { id: "world", labelRu: "Мир", labelEn: "World", order: 19 },
] as const;

/** All valid tag ids */
export const TAXONOMY_TAG_IDS = TAXONOMY_TAGS.map((t) => t.id);

/** TypeScript union of valid tag ids */
export type TaxonomyTagId = (typeof TAXONOMY_TAGS)[number]["id"];

/** Zod schema that accepts only valid taxonomy tag ids */
export const taxonomyTagIdSchema = z.enum(
  TAXONOMY_TAG_IDS as unknown as [string, ...string[]]
);

/** Fast lookup: id → tag metadata */
export const TAXONOMY_BY_ID = new Map(
  TAXONOMY_TAGS.map((t) => [t.id, t])
);

/** Validate that a string is a valid taxonomy tag */
export const isValidTaxonomyTag = (value: string): value is TaxonomyTagId =>
  TAXONOMY_BY_ID.has(value as TaxonomyTagId);

/** Get label for a tag id, with language */
export const getTagLabel = (
  tagId: string,
  lang: "RU" | "EN" = "EN"
): string | null => {
  const tag = TAXONOMY_BY_ID.get(tagId as TaxonomyTagId);
  if (!tag) return null;
  return lang === "RU" ? tag.labelRu : tag.labelEn;
};

/** Classifier JSON schema for OpenAI structured outputs */
export const CLASSIFIER_OUTPUT_SCHEMA = {
  type: "json_schema" as const,
  name: "market_classification",
  strict: true,
  schema: {
    type: "object",
    properties: {
      primaryTag: {
        type: "string",
        enum: TAXONOMY_TAG_IDS,
      },
      tags: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tag: { type: "string", enum: TAXONOMY_TAG_IDS },
            confidence: { type: "number" },
          },
          required: ["tag", "confidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["primaryTag", "tags"],
    additionalProperties: false,
  },
};

/** Zod parser for classifier output */
export const classifierOutputSchema = z.object({
  primaryTag: taxonomyTagIdSchema,
  tags: z
    .array(
      z.object({
        tag: taxonomyTagIdSchema,
        confidence: z.number().min(0).max(1),
      })
    )
    .min(1)
    .max(4),
});

export type ClassifierOutput = z.infer<typeof classifierOutputSchema>;
