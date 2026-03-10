import { z } from "zod";
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_LEADERBOARD_LIMIT,
  MAX_PROFILE_DESCRIPTION_LENGTH,
  MAX_PROFILE_USERNAME_LENGTH,
  MAX_USER_ACTIVITY_LIMIT,
  MAX_USERNAME_LENGTH,
  MIN_DISPLAY_NAME_LENGTH,
  MIN_MARKET_REF_LENGTH,
  MIN_PROFILE_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
} from "../constants";
import {
  leaderboardSortFieldSchema,
  marketBinaryOutcomeSchema,
  usernameAvailabilityReasonSchema,
} from "./common";

const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

export const avatarPaletteShape = z.object({
  primary: z.string().regex(hexColorRegex),
  secondary: z.string().regex(hexColorRegex),
});

export const userShape = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  profileDescription: z.string().nullable(),
  avatarPalette: avatarPaletteShape.nullable(),
  needsProfileSetup: z.boolean(),
  telegramPhotoUrl: z.string().nullable(),
  referralCode: z.string().nullable(),
  referralCommissionRate: z.number().nullable(),
  referralEnabled: z.boolean().nullable(),
  balance: z.number(),
  createdAt: z.string(),
  isAdmin: z.boolean(),
});

export const publicUserInput = z.object({
  userId: z.string(),
});

export const publicUserOutput = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  telegramPhotoUrl: z.string().nullable(),
});

export const publicUserStatsInput = z.object({
  userId: z.string(),
});

export const publicUserStatsOutput = z.object({
  userId: z.string(),
  pnlMajor: z.number(),
  betsCount: z.number(),
});

export const publicUserVotesInput = z.object({
  userId: z.string(),
  limit: z.number().int().positive().max(MAX_USER_ACTIVITY_LIMIT).optional(),
});

export const publicUserVotesOutput = z.array(
  z.object({
    marketId: z.string(),
    outcome: marketBinaryOutcomeSchema.nullable(),
    lastBetAt: z.string(),
    isActive: z.boolean(),
  })
);

export const publicUserCommentsInput = z.object({
  userId: z.string(),
  limit: z.number().int().positive().max(MAX_USER_ACTIVITY_LIMIT).optional(),
});

export const publicUserCommentsOutput = z.array(
  z.object({
    id: z.string(),
    marketId: z.string(),
    parentId: z.string().nullable(),
    body: z.string(),
    createdAt: z.string(),
    likesCount: z.number(),
  })
);

export const usernameAvailabilityOutput = z.object({
  available: z.boolean(),
  normalized: z.string(),
  reason: usernameAvailabilityReasonSchema.optional(),
});

export const checkUsernameAvailabilityInput = z.object({
  username: z.string().min(MIN_USERNAME_LENGTH).max(MAX_USERNAME_LENGTH),
});

export const updateDisplayNameInput = z.object({
  displayName: z.string().min(MIN_DISPLAY_NAME_LENGTH).max(MAX_DISPLAY_NAME_LENGTH),
});

export const updateProfileIdentityInput = z.object({
  username: z.string().min(MIN_PROFILE_USERNAME_LENGTH).max(MAX_PROFILE_USERNAME_LENGTH),
  displayName: z.string().min(MIN_DISPLAY_NAME_LENGTH).max(MAX_DISPLAY_NAME_LENGTH),
});

export const updateAvatarUrlInput = z.object({
  avatarUrl: z.string().url().nullable(),
  avatarPalette: avatarPaletteShape.nullable().optional(),
});

export const completeProfileSetupInput = z.object({
  username: z.string().min(MIN_PROFILE_USERNAME_LENGTH).max(MAX_PROFILE_USERNAME_LENGTH),
  displayName: z.string().min(MIN_DISPLAY_NAME_LENGTH).max(MAX_DISPLAY_NAME_LENGTH),
  email: z.string().trim().email().max(MAX_EMAIL_LENGTH).optional(),
  profileDescription: z.string().max(MAX_PROFILE_DESCRIPTION_LENGTH).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  avatarPalette: avatarPaletteShape.nullable().optional(),
});

export const createReferralLinkOutput = z.object({
  referralCode: z.string(),
  referralCommissionRate: z.number().nullable(),
  referralEnabled: z.boolean().nullable(),
});

export const leaderboardInput = z
  .object({
    limit: z.number().int().positive().max(MAX_LEADERBOARD_LIMIT).optional(),
    sortBy: leaderboardSortFieldSchema.optional(),
  })
  .optional();

export const leaderboardOutput = z.array(
  z.object({
    id: z.string(),
    rank: z.number(),
    name: z.string(),
    username: z.string().optional(),
    avatar: z.string(),
    balance: z.number(),
    pnl: z.number(),
    referrals: z.number().optional(),
    betCount: z.number().optional(),
  })
);

export const toggleUserIdInput = z.object({
  userId: z.string().min(MIN_MARKET_REF_LENGTH),
});
