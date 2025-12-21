import { Category, LeaderboardUser } from './types';

export const ACCENT_COLOR = '#f544a6'; // Neon Pink for 'No' / Accent
export const GREEN_COLOR = '#BEFF1D'; // Green for 'Yes' / Profit

export const CATEGORIES: { id: Category; labelRU: string; labelEN: string; icon: string }[] = [
  { id: 'ALL', labelRU: 'Все', labelEN: 'All', icon: '✦' },
  { id: 'POLITICS', labelRU: 'Политика', labelEN: 'Politics', icon: '⚖️' },
  { id: 'CRYPTO', labelRU: 'Крипта', labelEN: 'Crypto', icon: '₿' },
  { id: 'CELEBS', labelRU: 'Селебрити', labelEN: 'Celebs', icon: '✨' },
  { id: 'SCIENCE', labelRU: 'Наука', labelEN: 'Science', icon: '🧬' },
  { id: 'SOCIAL', labelRU: 'Соц сети', labelEN: 'Social', icon: '📱' },
  { id: 'MUSIC', labelRU: 'Музыка', labelEN: 'Music', icon: '🎵' },
  { id: 'ELECTIONS', labelRU: 'Выборы', labelEN: 'Elections', icon: '🗳️' },
  { id: 'WORLD', labelRU: 'Мировые', labelEN: 'World', icon: '🌍' },
];

export const MOCK_LEADERBOARD: LeaderboardUser[] = [
  {
    id: 'l1',
    rank: 1,
    name: 'SatoshiN',
    avatar: 'https://ui-avatars.com/api/?name=Satoshi&background=111&color=BEFF1D',
    balance: 145000,
    pnl: 45200,
    referrals: 124,
    portfolio: [
      {
        id: 'lp1',
        marketId: '4',
        marketTitle: 'BTC > 125k',
        type: 'YES',
        shares: 5000,
        avgPrice: 0.2,
        currentPrice: 0.33,
        endDate: '2025-12-31',
      },
    ],
  },
  {
    id: 'l2',
    rank: 2,
    name: 'Oracle_X',
    avatar: 'https://ui-avatars.com/api/?name=Oracle&background=111&color=f544a6',
    balance: 89000,
    pnl: 21500,
    referrals: 45,
    portfolio: [
      {
        id: 'lp2',
        marketId: '1',
        marketTitle: 'YouTube 2026',
        type: 'NO',
        shares: 2000,
        avgPrice: 0.7,
        currentPrice: 0.85,
        endDate: '2026-01-01',
      },
    ],
  },
  {
    id: 'l3',
    rank: 3,
    name: 'WhaleWatcher',
    avatar: 'https://ui-avatars.com/api/?name=Whale&background=111&color=fff',
    balance: 56000,
    pnl: 12400,
    referrals: 12,
    portfolio: [],
  },
  {
    id: 'l4',
    rank: 4,
    name: 'ElonFan',
    avatar: 'https://ui-avatars.com/api/?name=Elon&background=111&color=ddd',
    balance: 42000,
    pnl: 8900,
    referrals: 5,
    portfolio: [],
  },
  {
    id: 'l5',
    rank: 5,
    name: 'BearMarket',
    avatar: 'https://ui-avatars.com/api/?name=Bear&background=111&color=999',
    balance: 31000,
    pnl: -1200,
    referrals: 0,
    portfolio: [],
  },
];
