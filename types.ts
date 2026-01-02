
export type Category = 'ALL' | 'POLITICS' | 'CRYPTO' | 'CELEBS' | 'SCIENCE' | 'SOCIAL' | 'MUSIC' | 'ELECTIONS' | 'WORLD';

export interface HistoryPoint {
  date: string;
  value: number; // 0 to 100
}

export interface Comment {
  id: string;
  user: string;
  avatar: string;
  text: string;
  timestamp: string;
  likes: number;
}

export type MarketState = "open" | "closed" | "resolved" | "cancelled";

export interface Market {
  id: string;
  title: string;
  titleRu: string;
  titleEn: string;
  state: MarketState;
  outcome: "YES" | "NO" | null;
  category: Category;
  imageUrl: string;
  volume: string;
  closesAt: string; // Trading stops
  expiresAt: string; // Event end
  yesPrice: number;
  noPrice: number;
  chance: number; // Percentage for YES
  description: string;
  history: HistoryPoint[];
  comments: Comment[];
  isNew?: boolean;
  // LMSR specific
  liquidityB?: number;
  feeBps?: number;
  settlementAsset?: string;
}

/**
 * User position in a market (shares held)
 */
export interface Position {
  marketId: string;
  outcome: "YES" | "NO";
  shares: number;
  avgEntryPrice: number | null;
  marketTitleRu: string;
  marketTitleEn: string;
  marketState: MarketState;
  marketOutcome: "YES" | "NO" | null;
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
  outcome: "YES" | "NO";
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
  amount: number;
  status: "open" | "won" | "lost";
  payout: number | null;
  createdAt: string;
  marketOutcome: "YES" | "NO" | null;
  expiresAt: string | null;
  priceYes: number | null;
  priceNo: number | null;
  priceAtBet: number | null;
  shares: number | null;
}

export interface User {
  id: string;
  email?: string;
  username?: string;
  walletAddress?: string;
  balance: number; // In major units (e.g., 1.5 VCOIN)
  isAdmin?: boolean;
  pnl?: number; // Total Profit/Loss
  name?: string; // Display name
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
  outcome: "YES" | "NO";
  collateralGross: number;
  sharesDelta: number;
  priceBefore: number;
  priceAfter: number;
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
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradesCount: number;
}
