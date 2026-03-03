import { z } from "zod";

const priceCandleBase = z.object({
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

const liveActivityTickBase = z.object({
  id: z.string(),
  marketId: z.string(),
  tradeId: z.string().nullable(),
  side: z.enum(["BUY", "SELL", "UNKNOWN"]),
  outcome: z.string().nullable(),
  price: z.number(),
  size: z.number(),
  notional: z.number(),
  sourceTs: z.string(),
  createdAt: z.string(),
});

export const liveActivityTickSchema = liveActivityTickBase;
export const liveActivityTicksSchema = z.array(liveActivityTickSchema);

