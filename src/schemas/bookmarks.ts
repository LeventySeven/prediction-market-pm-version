import { z } from "zod";

export const marketBookmarksSchema = z.array(
  z.object({
    marketId: z.string(),
    createdAt: z.string(),
  })
);


