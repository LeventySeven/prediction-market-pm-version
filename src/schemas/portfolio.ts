import { z } from "zod";

const marketStateSchema = z.enum(["open", "closed", "resolved", "cancelled"]);

const positionBase = z.object({
  marketId: z.string(),
  outcome: z.enum(["YES", "NO"]).nullable(),
  outcomeId: z.string().nullable().optional(),
  outcomeTitle: z.string().nullable().optional(),
  shares: z.number(),
  avgEntryPrice: z.number().nullable(),
  marketTitleRu: z.string(),
  marketTitleEn: z.string(),
  marketState: marketStateSchema,
  marketOutcome: z.enum(["YES", "NO"]).nullable(),
  marketResolvedOutcomeId: z.string().nullable().optional(),
  closesAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

export const positionSchema = positionBase;
export const positionsSchema = z.array(positionSchema);

const tradeBase = z.object({
  id: z.string(),
  marketId: z.string(),
  action: z.enum(["buy", "sell"]),
  outcome: z.enum(["YES", "NO"]).nullable(),
  outcomeId: z.string().nullable().optional(),
  outcomeTitle: z.string().nullable().optional(),
  collateralGross: z.number(),
  fee: z.number(),
  collateralNet: z.number(),
  sharesDelta: z.number(),
  priceBefore: z.number(),
  priceAfter: z.number(),
  createdAt: z.string(),
  marketTitleRu: z.string(),
  marketTitleEn: z.string(),
  marketState: marketStateSchema,
  marketOutcome: z.enum(["YES", "NO"]).nullable(),
  marketResolvedOutcomeId: z.string().nullable().optional(),
  // computed later in app/page.tsx for sell entries
  avgEntryPrice: z.number().nullable().optional(),
  avgExitPrice: z.number().nullable().optional(),
  realizedPnl: z.number().nullable().optional(),
});

export const tradeSchema = tradeBase;
export const tradesSchema = z.array(tradeSchema);


