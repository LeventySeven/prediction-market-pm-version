import { z } from "zod";

const priceCandleBase = z.object({
  bucket: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  tradesCount: z.number(),
});

export const priceCandleSchema = priceCandleBase;
export const priceCandlesSchema = z.array(priceCandleSchema);

const publicTradeBase = z.object({
  id: z.string(),
  marketId: z.string(),
  action: z.enum(["buy", "sell"]),
  outcome: z.enum(["YES", "NO"]).nullable(),
  outcomeId: z.string().nullable().optional(),
  outcomeTitle: z.string().nullable().optional(),
  collateralGross: z.number(),
  sharesDelta: z.number(),
  priceBefore: z.number(),
  priceAfter: z.number(),
  createdAt: z.string(),
});

export const publicTradeSchema = publicTradeBase;
export const publicTradesSchema = z.array(publicTradeSchema);


