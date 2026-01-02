import { Category } from './types';

export const YES_COLOR = 'rgba(36, 182, 255, 1)'; // YES / positive
export const NO_COLOR = 'rgba(201, 37, 28, 1)'; // NO / negative

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

// No mock data in this codebase. Leaderboard is fetched from Supabase.
