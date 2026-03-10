import { z } from "zod";
import { MAX_FEED_LIMIT } from "../constants";
import { apiVersionV1Schema } from "./common";

export const feedItemOutput = z.object({
  marketId: z.string(),
  score: z.number(),
  reason: z.string(),
});

export const feedOutput = z.object({
  apiVersion: apiVersionV1Schema,
  items: z.array(feedItemOutput),
  nextCursor: z.string().nullable(),
});

export const getFeedInput = z
  .object({
    cursor: z.string().nullable().optional(),
    limit: z.number().int().positive().max(MAX_FEED_LIMIT).optional(),
  })
  .optional();
