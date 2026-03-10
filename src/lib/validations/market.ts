import { z } from "zod";
import {
  MAX_API_KEY_LENGTH,
  MAX_API_PASSPHRASE_LENGTH,
  MAX_API_SECRET_LENGTH,
  MAX_CLIENT_ORDER_ID_LENGTH,
  MAX_LIMITLESS_OWNER_ID,
  MAX_MARKET_ACTIVITY_LIMIT,
  MAX_MARKET_COMMENT_LIMIT,
  MAX_MARKET_LIST_PAGE,
  MAX_MARKET_LIST_PAGE_SIZE,
  MAX_MARKET_SEARCH_LIMIT,
  MAX_MARKET_SIMILAR_LIMIT,
  MAX_PRICE_CANDLE_LIMIT,
  MAX_RELAY_MARKET_SLUG_LENGTH,
  MAX_RELAY_IDEMPOTENCY_KEY_LENGTH,
  MAX_MY_COMMENTS_LIMIT,
  MIN_MARKET_REF_LENGTH,
  MIN_RELAY_IDEMPOTENCY_KEY_LENGTH,
} from "../constants";
import {
  apiVersionV1Schema,
  candleIntervalSchema,
  jsonValueSchema,
  marketActivitySideSchema,
  marketBinaryOutcomeSchema,
  marketOrderTypeSchema,
  marketStateSchema,
  marketTradeActionSchema,
  marketTypeSchema,
  venueProviderFilterSchema,
  venueProviderSchema,
} from "./common";

export const marketCategoryOutput = z.object({
  id: z.string(),
  labelRu: z.string(),
  labelEn: z.string(),
});

export const marketCategoryOutputArray = z.array(marketCategoryOutput);

export const enabledProvidersOutput = z.object({
  providers: z.array(venueProviderSchema),
});

export const marketOutcomeOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  providerOutcomeId: z.string().nullable().optional(),
  providerTokenId: z.string().nullable().optional(),
  tokenId: z.string().nullable().optional(),
  slug: z.string(),
  title: z.string(),
  iconUrl: z.string().nullable(),
  chartColor: z.string().nullable().optional(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  probability: z.number(),
  price: z.number(),
});

export const limitlessTradeMetaOutput = z.object({
  marketSlug: z.string(),
  exchangeAddress: z.string(),
  adapterAddress: z.string().nullable(),
  collateralTokenAddress: z.string(),
  collateralTokenDecimals: z.number().int().positive(),
  minOrderSize: z.number().nullable(),
  positionIds: z.tuple([z.string(), z.string()]),
});

export const marketFreshnessOutput = z.object({
  sourceTs: z.string().nullable(),
  stale: z.boolean(),
});

export const marketCapabilitiesOutput = z.object({
  supportsTrading: z.boolean(),
  supportsCandles: z.boolean(),
  supportsPublicTrades: z.boolean(),
  chainId: z.number().nullable(),
});

export const marketTradeMetaOutput = z
  .object({
    limitless: limitlessTradeMetaOutput.nullable().optional(),
  })
  .nullable()
  .optional();

export const marketOutput = z.object({
  id: z.string(),
  provider: venueProviderSchema.optional(),
  providerMarketId: z.string().optional(),
  canonicalMarketId: z.string().optional(),
  marketRefId: z.string().nullable().optional(),
  titleRu: z.string(),
  titleEn: z.string(),
  description: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  imageUrl: z.string().optional(),
  state: marketStateSchema,
  createdAt: z.string(),
  closesAt: z.string(),
  expiresAt: z.string(),
  marketType: marketTypeSchema.optional(),
  resolvedOutcomeId: z.string().nullable().optional(),
  outcomes: z.array(marketOutcomeOutput).optional(),
  outcome: marketBinaryOutcomeSchema.nullable(),
  createdBy: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  categoryLabelRu: z.string().nullable().optional(),
  categoryLabelEn: z.string().nullable().optional(),
  settlementAsset: z.string().nullable().optional(),
  feeBps: z.number().nullable().optional(),
  liquidityB: z.number().nullable().optional(),
  priceYes: z.number(),
  priceNo: z.number(),
  volume: z.number(),
  totalVolumeUsd: z.number().nullable().optional(),
  chance: z.number().nullable().optional(),
  creatorName: z.string().nullable().optional(),
  creatorAvatarUrl: z.string().nullable().optional(),
  bestBid: z.number().nullable().optional(),
  bestAsk: z.number().nullable().optional(),
  mid: z.number().nullable().optional(),
  lastTradePrice: z.number().nullable().optional(),
  lastTradeSize: z.number().nullable().optional(),
  rolling24hVolume: z.number().nullable().optional(),
  openInterest: z.number().nullable().optional(),
  liveUpdatedAt: z.string().nullable().optional(),
  capabilities: marketCapabilitiesOutput.optional(),
  freshness: marketFreshnessOutput.nullable().optional(),
  tradeMeta: marketTradeMetaOutput,
});

export const marketOutputArray = z.array(marketOutput);

export const marketBookmarkOutput = z.object({
  marketId: z.string(),
  createdAt: z.string(),
});

export const marketBookmarkOutputArray = z.array(marketBookmarkOutput);

export const priceCandleOutput = z.object({
  bucket: z.string(),
  outcomeId: z.string().nullable().optional(),
  outcomeTitle: z.string().nullable().optional(),
  outcomeColor: z.string().nullable().optional(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  tradesCount: z.number(),
});

export const priceCandleOutputArray = z.array(priceCandleOutput);

export const publicTradeOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  action: marketTradeActionSchema,
  outcome: marketBinaryOutcomeSchema.nullable(),
  outcomeId: z.string().nullable().optional(),
  outcomeTitle: z.string().nullable().optional(),
  collateralGross: z.number(),
  sharesDelta: z.number(),
  priceBefore: z.number(),
  priceAfter: z.number(),
  createdAt: z.string(),
});

export const publicTradeOutputArray = z.array(publicTradeOutput);

export const liveActivityTickOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  tradeId: z.string().nullable(),
  side: marketActivitySideSchema,
  outcome: z.string().nullable(),
  price: z.number(),
  size: z.number(),
  notional: z.number(),
  sourceTs: z.string(),
  createdAt: z.string(),
});

export const liveActivityTickOutputArray = z.array(liveActivityTickOutput);

export const marketCommentOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  userId: z.string(),
  parentId: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
  authorName: z.string(),
  authorUsername: z.string().nullable(),
  authorAvatarUrl: z.string().nullable(),
  likesCount: z.number(),
  likedByMe: z.boolean(),
});

export const marketCommentOutputArray = z.array(marketCommentOutput);

export const myCommentOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  parentId: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
  marketTitleRu: z.string(),
  marketTitleEn: z.string(),
  likesCount: z.number(),
});

export const myCommentOutputArray = z.array(myCommentOutput);

export const marketContextOutput = z.object({
  marketId: z.string(),
  context: z.string(),
  sources: z.array(z.string()),
  updatedAt: z.string(),
  generated: z.boolean(),
});

export const marketListV1ItemOutput = z.object({
  market: marketOutput,
  score: z.number(),
});

export const marketListV1Output = z.object({
  apiVersion: apiVersionV1Schema,
  items: z.array(marketListV1ItemOutput),
});

export const similarMarketsV1Output = z.object({
  apiVersion: apiVersionV1Schema,
  items: z.array(marketListV1ItemOutput),
});

export const listMarketCategoriesInput = z
  .object({
    providers: z.array(venueProviderSchema).optional(),
    providerFilter: venueProviderFilterSchema.optional(),
  })
  .optional();

export const listMarketsInput = z
  .object({
    onlyOpen: z.boolean().optional(),
    page: z.number().int().positive().max(MAX_MARKET_LIST_PAGE).optional(),
    pageSize: z.number().int().positive().max(MAX_MARKET_LIST_PAGE_SIZE).optional(),
    sortBy: z.enum(["newest", "volume"]).optional(),
    providers: z.array(venueProviderSchema).optional(),
    providerFilter: venueProviderFilterSchema.optional(),
  })
  .optional();

export const getMarketInput = z.object({
  marketId: z.string().min(MIN_MARKET_REF_LENGTH),
  provider: venueProviderSchema.optional(),
});

export const searchSemanticInput = z.object({
  query: z.string().min(2).max(256),
  limit: z.number().int().positive().max(MAX_MARKET_SEARCH_LIMIT).optional(),
  onlyOpen: z.boolean().optional(),
  providers: z.array(venueProviderSchema).optional(),
  providerFilter: venueProviderFilterSchema.optional(),
});

export const getSimilarMarketsInput = z.object({
  marketId: z.string().min(MIN_MARKET_REF_LENGTH),
  limit: z.number().int().positive().max(MAX_MARKET_SIMILAR_LIMIT).optional(),
});

export const generateMarketContextInput = z.object({
  marketId: z.string().min(MIN_MARKET_REF_LENGTH),
  provider: venueProviderSchema.optional(),
});

export const relaySignedOrderInput = z
  .object({
    provider: venueProviderSchema.default("polymarket"),
    marketId: z.string().min(MIN_MARKET_REF_LENGTH).optional(),
    marketSlug: z.string().min(MIN_MARKET_REF_LENGTH).max(MAX_RELAY_MARKET_SLUG_LENGTH).optional(),
    signedOrder: z.record(z.string(), jsonValueSchema),
    orderType: marketOrderTypeSchema,
    idempotencyKey: z
      .string()
      .min(MIN_RELAY_IDEMPOTENCY_KEY_LENGTH)
      .max(MAX_RELAY_IDEMPOTENCY_KEY_LENGTH),
    clientOrderId: z.string().min(MIN_MARKET_REF_LENGTH).max(MAX_CLIENT_ORDER_ID_LENGTH).optional(),
    apiCreds: z
      .object({
        key: z.string().min(MIN_MARKET_REF_LENGTH).max(MAX_API_KEY_LENGTH),
        secret: z.string().min(MIN_MARKET_REF_LENGTH).max(MAX_API_SECRET_LENGTH),
        passphrase: z.string().min(MIN_MARKET_REF_LENGTH).max(MAX_API_PASSPHRASE_LENGTH),
      })
      .optional(),
    limitlessAuth: z
      .object({
        apiKey: z.string().min(MIN_MARKET_REF_LENGTH).max(MAX_API_KEY_LENGTH),
        ownerId: z.number().int().positive().max(MAX_LIMITLESS_OWNER_ID),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.provider === "polymarket") {
      if (!value.apiCreds) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "POLYMARKET_API_CREDS_REQUIRED",
          path: ["apiCreds"],
        });
      }
      return;
    }

    if (!value.limitlessAuth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LIMITLESS_AUTH_REQUIRED",
        path: ["limitlessAuth"],
      });
    }
    if (!value.marketSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LIMITLESS_MARKET_SLUG_REQUIRED",
        path: ["marketSlug"],
      });
    }
  });

export const relaySignedOrderOutput = z.object({
  success: z.boolean(),
  status: z.number(),
  payload: jsonValueSchema.optional(),
  error: z.string().optional(),
});

export const setBookmarkInput = z.object({
  marketId: z.string().min(MIN_MARKET_REF_LENGTH),
  provider: venueProviderSchema.optional(),
  bookmarked: z.boolean(),
});

export const setBookmarkOutput = z.object({
  marketId: z.string(),
  bookmarked: z.boolean(),
});

export const getPriceCandlesInput = z.object({
  marketId: z.string().min(MIN_MARKET_REF_LENGTH),
  provider: venueProviderSchema.optional(),
  interval: candleIntervalSchema.optional(),
  limit: z.number().int().positive().max(MAX_PRICE_CANDLE_LIMIT).optional(),
});

export const getLiveActivityInput = z.object({
  marketId: z.string().min(MIN_MARKET_REF_LENGTH),
  provider: venueProviderSchema.optional(),
  limit: z.number().int().positive().max(MAX_MARKET_ACTIVITY_LIMIT).optional(),
});

export const getPublicTradesInput = z.object({
  marketId: z.string().min(MIN_MARKET_REF_LENGTH),
  provider: venueProviderSchema.optional(),
  limit: z.number().int().positive().max(MAX_MARKET_ACTIVITY_LIMIT).optional(),
});

export const getMarketCommentsInput = z.object({
  marketId: z.string().min(MIN_MARKET_REF_LENGTH),
  limit: z.number().int().positive().max(MAX_MARKET_COMMENT_LIMIT).optional(),
});

export const postMarketCommentInput = z.object({
  marketId: z.string().min(MIN_MARKET_REF_LENGTH),
  provider: venueProviderSchema.optional(),
  body: z.string().min(1).max(2000),
  parentId: z.string().nullable().optional(),
});

export const toggleMarketCommentLikeInput = z.object({
  commentId: z.string().min(MIN_MARKET_REF_LENGTH),
});

export const toggleMarketCommentLikeOutput = z.object({
  commentId: z.string(),
  liked: z.boolean(),
  likesCount: z.number(),
});

export const myCommentsInput = z
  .object({
    limit: z.number().int().positive().max(MAX_MY_COMMENTS_LIMIT).optional(),
  })
  .optional();

export type CandleInterval = z.infer<typeof candleIntervalSchema>;
export type MarketCategoryOutput = z.infer<typeof marketCategoryOutput>;
export type MarketOutput = z.infer<typeof marketOutput>;
export type MarketFreshnessOutput = z.infer<typeof marketFreshnessOutput>;
export type LimitlessTradeMetaOutput = z.infer<typeof limitlessTradeMetaOutput>;
export type PriceCandleOutput = z.infer<typeof priceCandleOutput>;
export type PublicTradeOutput = z.output<typeof publicTradeOutput>;
export type LiveActivityTickOutput = z.output<typeof liveActivityTickOutput>;
