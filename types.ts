
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

export interface Market {
  id: string;
  title: string;
  titleRu: string;
  titleEn: string;
  category: Category;
  imageUrl: string;
  volume: string;
  endDate: string; // ISO format or parsable date
  yesPrice: number;
  noPrice: number;
  chance: number; // Percentage for YES
  description: string; // Rules text
  history: HistoryPoint[];
  comments: Comment[];
  isNew?: boolean; // New flag for the badge
  poolYes?: number;
  poolNo?: number;
}

export interface PortfolioPosition {
  id: string;
  marketId: string;
  marketTitle: string;
  type: 'YES' | 'NO';
  shares: number;
  avgPrice: number;
  currentPrice: number;
  endDate: string;
}

export interface Bet {
  id: string;
  marketId: string;
  marketTitle: string;
  marketTitleRu: string;
  marketTitleEn: string;
  side: "YES" | "NO";
  amount: number;
  status: string;
  payout: number | null;
  createdAt: string;
  marketOutcome: "YES" | "NO" | null;
  expiresAt: string | null;
  priceYes: number | null;
  priceNo: number | null;
}

export interface User {
  id: string;
  email?: string;
  username?: string;
  walletAddress?: string;
  balance: number;
  isAdmin?: boolean;
  pnl?: number; // Total Profit/Loss
  portfolio?: PortfolioPosition[];
  name?: string; // Display name
  referrals?: number;
  avatar?: string;
}

export interface LeaderboardUser extends User {
  rank: number;
  avatar: string;
}
