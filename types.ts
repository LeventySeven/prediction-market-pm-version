

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

export interface User {
  id: string;
  email?: string;
  walletAddress?: string;
  balance: number;
  pnl?: number; // Total Profit/Loss
  portfolio?: PortfolioPosition[];
  name?: string; // Display name
  referrals?: number;
}

export interface LeaderboardUser extends User {
    rank: number;
    avatar: string;
}