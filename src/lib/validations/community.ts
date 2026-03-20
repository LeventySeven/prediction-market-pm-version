import { z } from "zod";
import { apiVersionV1Schema } from "./common";
import { taxonomyTagIdSchema } from "../taxonomy";

export const communityOutput = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  accentColor: z.string(),
  visibility: z.literal("public"),
  creatorUserId: z.string(),
  tags: z.array(z.string()),
  memberCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const communityListOutput = z.object({
  apiVersion: apiVersionV1Schema,
  items: z.array(communityOutput),
  nextCursor: z.string().nullable(),
});

export const communityFeedItemOutput = z.object({
  marketId: z.string(),
  score: z.number(),
  reason: z.string(),
});

export const communityFeedOutput = z.object({
  apiVersion: apiVersionV1Schema,
  items: z.array(communityFeedItemOutput),
  nextCursor: z.string().nullable(),
});

export const createCommunityInput = z.object({
  name: z.string().min(2).max(64),
  slug: z.string().min(2).max(64).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Invalid slug format"),
  description: z.string().max(500).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be hex color").optional(),
  tags: z.array(taxonomyTagIdSchema).min(1).max(10),
});

export const updateCommunityInput = z.object({
  communityId: z.string().uuid(),
  name: z.string().min(2).max(64).optional(),
  description: z.string().max(500).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  tags: z.array(taxonomyTagIdSchema).min(1).max(10).optional(),
});

export const getCommunityInput = z.object({
  slug: z.string().min(2).max(64),
});

export const listCommunitiesInput = z.object({
  limit: z.number().int().positive().max(50).optional(),
  cursor: z.string().optional(),
}).optional();

export const getCommunityFeedInput = z.object({
  communityId: z.string().uuid(),
  limit: z.number().int().positive().max(50).optional(),
  cursor: z.string().optional(),
});

export type CommunityOutput = z.infer<typeof communityOutput>;
