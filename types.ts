
export type Category = 'ALL' | 'POLITICS' | 'CRYPTO' | 'CELEBS' | 'SCIENCE' | 'SOCIAL' | 'MUSIC' | 'ELECTIONS' | 'WORLD';

export interface HistoryPoint {
  date: string;
  value: number; // 0 to 100
}

export interface Comment {
  id: string;
  userId: string;
  username: string | null;
  user: string;
  avatar: string;
  text: string;
  createdAt: string;
  timestamp: string;
  likes: number;
  likedByMe?: boolean;
  parentId?: string | null;
}

export interface UserCommentSummary {
  id: string;
  marketId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  marketTitleRu: string;
  marketTitleEn: string;
  likesCount: number;
}

export type MarketState = "open" | "closed" | "resolved" | "cancelled";
export type MarketType = "binary" | "multi_choice";

export interface MarketOutcome {
  id: string;
  marketId: string;
  tokenId?: string | null;
  slug: string;
  title: string;
  iconUrl: string | null;
  chartColor?: string | null;
  sortOrder: number;
  probability: number;
  price: number;
  isActive: boolean;
}

export interface Market {
  id: string;
  provider?: "polymarket" | "limitless";
  providerMarketId?: string;
  canonicalMarketId?: string;
  title: string;
  titleRu: string | null;
  titleEn: string;
  state: MarketState;
  marketType?: MarketType;
  resolvedOutcomeId?: string | null;
  outcomes?: MarketOutcome[];
  outcome: "YES" | "NO" | null;
  createdBy?: string | null;
  creatorName?: string | null;
  creatorAvatarUrl?: string | null;
  createdAt: string;
  categoryId: string | null;
  categoryLabelRu: string | null;
  categoryLabelEn: string | null;
  imageUrl: string;
  volume: string;
  volumeRaw?: number | null;
  closesAt: string; // Trading stops
  expiresAt: string; // Event end
  yesPrice: number;
  noPrice: number;
  chance: number; // Percentage for YES
  description: string;
  source: string | null;
  history: HistoryPoint[];
  comments: Comment[];
  isNew?: boolean;
  // LMSR specific
  liquidityB?: number;
  feeBps?: number;
  settlementAsset?: string;
  bestBid?: number | null;
  bestAsk?: number | null;
  mid?: number | null;
  lastTradePrice?: number | null;
  lastTradeSize?: number | null;
  rolling24hVolume?: number | null;
  openInterest?: number | null;
  liveUpdatedAt?: string | null;
  capabilities?: {
    supportsTrading: boolean;
    supportsCandles: boolean;
    supportsPublicTrades: boolean;
    chainId: number | null;
  } | null;
}

/**
 * User position in a market (shares held)
 */
export interface Position {
  marketId: string;
  outcome: "YES" | "NO" | null;
  outcomeId?: string | null;
  outcomeTitle?: string | null;
  shares: number;
  avgEntryPrice: number | null;
  marketTitleRu: string;
  marketTitleEn: string;
  marketState: MarketState;
  marketOutcome: "YES" | "NO" | null;
  marketResolvedOutcomeId?: string | null;
  closesAt: string | null;
  expiresAt: string | null;
}

/**
 * Trade record (buy or sell)
 */
export interface Trade {
  id: string;
  marketId: string;
  action: "buy" | "sell";
  outcome: "YES" | "NO" | null;
  outcomeId?: string | null;
  outcomeTitle?: string | null;
  collateralGross: number;
  fee: number;
  collateralNet: number;
  sharesDelta: number;
  priceBefore: number;
  priceAfter: number;
  createdAt: string;
  marketTitleRu: string;
  marketTitleEn: string;
  marketState: MarketState;
  marketOutcome: "YES" | "NO" | null;
  marketResolvedOutcomeId?: string | null;
  avgEntryPrice?: number | null;
  avgExitPrice?: number | null;
  realizedPnl?: number | null;
}

/**
 * Legacy Bet type - mapped from Position for backwards compatibility
 */
export interface Bet {
  id: string;
  marketId: string;
  marketTitle: string;
  marketTitleRu: string;
  marketTitleEn: string;
  side: "YES" | "NO";
  outcomeId?: string | null;
  outcomeTitle?: string | null;
  amount: number;
  status: "open" | "won" | "lost";
  payout: number | null;
  createdAt: string;
  marketOutcome: "YES" | "NO" | null;
  expiresAt: string | null;
  priceYes: number | null;
  priceNo: number | null;
  currentPrice?: number | null;
  priceAtBet: number | null;
  shares: number | null;
}

export interface User {
  id: string;
  email?: string;
  username?: string;
  privyUserId?: string | null;
  walletAddress?: string | null;
  balance: number; // In major units (e.g., 1.5 VCOIN)
  isAdmin?: boolean;
  pnl?: number; // Total Profit/Loss
  name?: string; // Display name
  avatarUrl?: string | null; // user-controlled avatar URL
  telegramPhotoUrl?: string | null; // Telegram-provided photo URL (fallback)
  profileDescription?: string | null;
  avatarPalette?: {
    primary: string;
    secondary: string;
  } | null;
  needsProfileSetup?: boolean;
  referralCode?: string | null;
  referralCommissionRate?: number | null;
  referralEnabled?: boolean | null;
  createdAt?: string;
  referrals?: number;
  avatar?: string;
}

export interface WalletTransaction {
  id: string;
  assetCode: string;
  amountMinor: number;
  amountMajor: number;
  kind: string;
  marketId: string | null;
  tradeId: string | null;
  createdAt: string;
}

export type { LeaderboardUser } from "./src/schemas/leaderboard";

export interface PublicTrade {
  id: string;
  marketId: string;
  action: "buy" | "sell";
  outcome: "YES" | "NO" | null;
  outcomeId?: string | null;
  outcomeTitle?: string | null;
  collateralGross: number;
  sharesDelta: number;
  priceBefore: number;
  priceAfter: number;
  createdAt: string;
}

export interface LiveActivityTick {
  id: string;
  marketId: string;
  tradeId: string | null;
  side: "BUY" | "SELL" | "UNKNOWN";
  outcome: string | null;
  price: number;
  size: number;
  notional: number;
  sourceTs: string;
  createdAt: string;
}

/**
 * Wallet balance (multi-asset support)
 */
export interface WalletBalance {
  assetCode: string;
  balanceMinor: number;
  balanceMajor: number;
  decimals: number;
}

/**
 * Price candle for charts
 */
export interface PriceCandle {
  bucket: string;
  outcomeId?: string | null;
  outcomeTitle?: string | null;
  outcomeColor?: string | null;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradesCount: number;
}
