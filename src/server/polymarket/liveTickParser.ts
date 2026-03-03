type TickPayload = Record<string, unknown>;

export type ParsedLiveTick = {
  marketId: string;
  tradeId: string | null;
  sourceSeq: number | null;
  sourceTs: string;
  side: "BUY" | "SELL" | "UNKNOWN";
  outcome: string | null;
  price: number;
  size: number;
  dedupeKey: string;
};

export type LiveTickContext = {
  marketId: string;
  sourceSeq: number | null;
  sourceTs: string;
  lastTradePrice: number;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const clampPrice = (value: number): number => Math.max(0, Math.min(1, value));

const toUpperString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
};

export const parseTradeSide = (payload: TickPayload): "BUY" | "SELL" | "UNKNOWN" => {
  const candidates = [
    payload.side,
    payload.taker_side,
    payload.takerSide,
    payload.maker_side,
    payload.makerSide,
    payload.action,
    payload.trade_side,
  ];
  for (const value of candidates) {
    const side = toUpperString(value);
    if (!side) continue;
    if (side.includes("BUY") || side === "BID") return "BUY";
    if (side.includes("SELL") || side === "ASK") return "SELL";
  }
  return "UNKNOWN";
};

export const parseTradeOutcome = (payload: TickPayload): string | null => {
  const candidates = [
    payload.outcome,
    payload.outcome_title,
    payload.outcomeTitle,
    payload.position,
    payload.side_label,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
};

export const parseTradeId = (payload: TickPayload): string | null => {
  const candidates = [
    payload.trade_id,
    payload.tradeId,
    payload.id,
    payload.tx_hash,
    payload.transactionHash,
    payload.hash,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
};

export const buildTickDedupeKey = (
  marketId: string,
  tradeId: string | null,
  sourceTsIso: string,
  price: number,
  size: number,
  side: "BUY" | "SELL" | "UNKNOWN",
  outcome: string | null
): string =>
  [
    marketId,
    tradeId ?? "",
    sourceTsIso,
    price.toFixed(8),
    size.toFixed(8),
    side,
    outcome ?? "",
  ].join("|");

export const parseLiveTick = (
  payload: TickPayload,
  live: LiveTickContext
): ParsedLiveTick | null => {
  const sizeRaw = toNumber(
    payload.last_trade_size ?? payload.size ?? payload.trade_size ?? payload.amount
  );
  if (sizeRaw === null) return null;
  const size = Math.max(0, sizeRaw);
  if (!(size > 0)) return null;

  const priceRaw = toNumber(
    payload.last_trade_price ?? payload.price ?? payload.lastPrice ?? payload.mid
  );
  const fallbackPrice = Number.isFinite(live.lastTradePrice) ? live.lastTradePrice : 0;
  const normalizedPriceInput = priceRaw ?? fallbackPrice;
  const price = clampPrice(normalizedPriceInput > 1 ? normalizedPriceInput / 100 : normalizedPriceInput);
  if (!Number.isFinite(price)) return null;

  const side = parseTradeSide(payload);
  const outcome = parseTradeOutcome(payload);
  const tradeId = parseTradeId(payload);

  return {
    marketId: live.marketId,
    tradeId,
    sourceSeq: live.sourceSeq,
    sourceTs: live.sourceTs,
    side,
    outcome,
    price,
    size,
    dedupeKey: buildTickDedupeKey(live.marketId, tradeId, live.sourceTs, price, size, side, outcome),
  };
};
