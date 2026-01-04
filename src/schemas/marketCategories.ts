import { z } from "zod";

export const marketCategorySchema = z.object({
  id: z.string(),
  labelRu: z.string(),
  labelEn: z.string(),
});

export const marketCategoriesSchema = z.array(marketCategorySchema);

export type MarketCategory = z.infer<typeof marketCategorySchema>;


