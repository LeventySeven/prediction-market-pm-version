
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
  endDate: string;
  poolYes?: number;
  poolNo?: number;
  yesPrice: number;
  noPrice: number;
  chance: number; // Percentage for YES
  description: string; // Rules text
  history: HistoryPoint[];
  comments: Comment[];
}

export interface User {
  id: string;
  email?: string;
  username?: string;
  walletAddress?: string;
  balance: number;
  isAdmin?: boolean;
}