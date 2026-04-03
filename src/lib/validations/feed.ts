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

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

export const getActivityInput = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
  })
  .optional();

export const activityItemOutput = z.object({
  id: z.string(),
  type: z.enum(["comment", "trade", "bookmark"]),
  actorName: z.string(),
  actorUsername: z.string().nullable(),
  actorAvatarUrl: z.string().nullable(),
  marketId: z.string(),
  marketTitle: z.string().nullable(),
  body: z.string().nullable(),
  createdAt: z.string(),
});

export const activityOutput = z.object({
  apiVersion: apiVersionV1Schema,
  items: z.array(activityItemOutput),
});
