export type VenueProvider = "polymarket" | "limitless";

export type VenueMarketState = "open" | "closed" | "resolved" | "cancelled";

export type VenueOutcome = {
  id: string;
  providerOutcomeId: string | null;
  providerTokenId: string | null;
  title: string;
  probability: number;
  price: number;
  sortOrder: number;
  isActive: boolean;
};

export type VenueCapabilities = {
  supportsTrading: boolean;
  supportsCandles: boolean;
  supportsPublicTrades: boolean;
  chainId: number | null;
};

export type VenueMarket = {
  provider: VenueProvider;
  providerMarketId: string;
  providerConditionId: string | null;
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  state: VenueMarketState;
  closesAt: string;
  expiresAt: string;
  createdAt: string;
  category: string | null;
  volume: number;
  resolvedOutcomeTitle: string | null;
  outcomes: VenueOutcome[];
  capabilities: VenueCapabilities;
};

export type VenuePricePoint = {
  ts: number;
  price: number;
};

export type VenuePublicTrade = {
  id: string;
  side: "BUY" | "SELL";
  outcome: string | null;
  size: number;
  price: number;
  timestamp: number;
};

export type VenueTradeAccessStatus = {
  status: "ALLOWED" | "BLOCKED_REGION" | "UNKNOWN_TEMP_ERROR";
  allowed: boolean;
  reasonCode: string | null;
  message: string | null;
  checkedAt: string;
};

export type VenueApiCreds = {
  key: string;
  secret: string;
  passphrase: string;
};

export type VenueRelayOrderInput = {
  signedOrder: Record<string, unknown>;
  orderType: "FOK" | "GTC";
  apiCreds: VenueApiCreds;
  makerAddress?: string | null;
  clientOrderId?: string | null;
  requestIp?: string | null;
};

export type VenueRelayOrderOutput = {
  success: boolean;
  status: number;
  payload?: unknown;
  error?: string;
};

export type VenueAdapter = {
  provider: VenueProvider;
  capabilities: VenueCapabilities;
  isEnabled: () => boolean;
  listMarketsSnapshot: (params?: { limit?: number; onlyOpen?: boolean }) => Promise<VenueMarket[]>;
  searchMarkets: (query: string, limit?: number) => Promise<VenueMarket[]>;
  getMarketById: (marketId: string) => Promise<VenueMarket | null>;
  getPriceHistory: (market: VenueMarket, limit?: number) => Promise<VenuePricePoint[]>;
  getPublicTrades: (market: VenueMarket, limit?: number) => Promise<VenuePublicTrade[]>;
  checkTradeAccess: (params: { requestIp?: string | null; cacheKey: string }) => Promise<VenueTradeAccessStatus>;
  relaySignedOrder: (input: VenueRelayOrderInput) => Promise<VenueRelayOrderOutput>;
  wsCollectorConfig?: () => { url: string | null; channels: string[] };
};

export const venueToCanonicalId = (provider: VenueProvider, providerMarketId: string): string =>
  `${provider}:${providerMarketId}`;

export const parseVenueMarketRef = (
  marketId: string,
  explicitProvider?: VenueProvider | null
): { provider: VenueProvider; providerMarketId: string; canonicalMarketId: string } => {
  const trimmed = marketId.trim();
  const fromExplicit = explicitProvider ?? null;
  if (fromExplicit) {
    return {
      provider: fromExplicit,
      providerMarketId: trimmed,
      canonicalMarketId: venueToCanonicalId(fromExplicit, trimmed),
    };
  }

  if (trimmed.startsWith("polymarket:")) {
    const providerMarketId = trimmed.slice("polymarket:".length);
    return {
      provider: "polymarket",
      providerMarketId,
      canonicalMarketId: venueToCanonicalId("polymarket", providerMarketId),
    };
  }

  if (trimmed.startsWith("limitless:")) {
    const providerMarketId = trimmed.slice("limitless:".length);
    return {
      provider: "limitless",
      providerMarketId,
      canonicalMarketId: venueToCanonicalId("limitless", providerMarketId),
    };
  }

  return {
    provider: "polymarket",
    providerMarketId: trimmed,
    canonicalMarketId: venueToCanonicalId("polymarket", trimmed),
  };
};
