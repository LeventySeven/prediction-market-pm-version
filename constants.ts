



import { Market, Category, HistoryPoint, Comment, LeaderboardUser } from './types';

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

// Helper to generate fake history graph data
export const generateHistory = (startChance: number, endChance: number): HistoryPoint[] => {
  const points: HistoryPoint[] = [];
  const days = 30;
  let current = startChance;
  for (let i = 0; i <= days; i++) {
    const volatility = Math.random() * 10 - 5;
    current = Math.max(1, Math.min(99, current + volatility));
    if (i === days) current = endChance; // Snap to current chance at end
    
    const d = new Date();
    d.setDate(d.getDate() - (days - i));
    
    points.push({
      date: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      value: Number(current.toFixed(1))
    });
  }
  return points;
};

const MOCK_COMMENTS: Comment[] = [
    { id: 'c1', user: 'CryptoKing', avatar: 'https://ui-avatars.com/api/?name=CK&background=333&color=fff', text: 'Думаю шансы занижены, буду покупать YES', timestamp: '2ч назад', likes: 12 },
    { id: 'c2', user: 'Ivan2004', avatar: 'https://ui-avatars.com/api/?name=I2&background=333&color=fff', text: 'Не верю в это, слишком рискованно', timestamp: '5ч назад', likes: 5 },
    { id: 'c3', user: 'ArbitrageBot', avatar: 'https://ui-avatars.com/api/?name=AB&background=333&color=fff', text: 'Ликвидность отличная, залетаю', timestamp: '1д назад', likes: 8 },
];

export const MOCK_MARKETS: Market[] = [
  {
    id: '1',
    title: 'Разблокируют ли YouTube в РФ до Января 2026?',
    titleRu: 'Разблокируют ли YouTube в РФ до Января 2026?',
    titleEn: 'Will YouTube be unblocked in Russia by Jan 2026?',
    category: 'SOCIAL',
    imageUrl: 'https://ui-avatars.com/api/?name=YouTube&background=000&color=fff&size=128&font-size=0.4&bold=true',
    volume: '$3.2m',
    endDate: '2026-01-01',
    yesPrice: 0.15,
    noPrice: 0.85,
    chance: 15,
    description: "Рынок разрешается положительно, если YouTube станет полностью доступен без VPN через основных провайдеров РФ до 1 января 2026 года. Официальное заявление РКН или правительства также будет считаться подтверждением.",
    history: generateHistory(40, 15),
    comments: MOCK_COMMENTS,
    isNew: true
  },
  {
    id: '2',
    title: 'Привлекут ли Долину к ответственности за схему с квартирой?',
    titleRu: 'Привлекут ли Долину к ответственности за схему с квартирой?',
    titleEn: 'Will Larisa Dolina face charges over the apartment scheme?',
    category: 'CELEBS',
    imageUrl: 'https://ui-avatars.com/api/?name=Larisa+Dolina&background=000&color=fff&size=128',
    volume: '$840k',
    endDate: '2024-12-31',
    yesPrice: 0.42,
    noPrice: 0.58,
    chance: 42,
    description: "Рынок разрешается положительно, если Ларисе Долиной будет предъявлено официальное обвинение правоохранительными органами РФ в связи с недавней сделкой с недвижимостью до конца 2024 года.",
    history: generateHistory(10, 42),
    comments: MOCK_COMMENTS
  },
  {
    id: '3',
    title: 'Займет ли песня "Баобаб" (Ivan Zolo) топ-1 в Яндекс Музыке?',
    titleRu: 'Займет ли песня "Баобаб" (Ivan Zolo) топ-1 в Яндекс Музыке?',
    titleEn: 'Will "Baobab" by Ivan Zolo hit #1 on Yandex Music?',
    category: 'MUSIC',
    imageUrl: 'https://ui-avatars.com/api/?name=Ivan+Zolo&background=000&color=fff&size=128',
    volume: '$125k',
    endDate: '2025-02-28',
    yesPrice: 0.08,
    noPrice: 0.92,
    chance: 8,
    description: "Если трек достигнет 1 места в официальном чарте Яндекс Музыки в любой день до указанной даты. Скриншоты чарта принимаются как доказательство.",
    history: generateHistory(2, 8),
    comments: MOCK_COMMENTS
  },
  {
    id: '4',
    title: 'Будет ли Bitcoin стоить выше $125,000 к концу 2025?',
    titleRu: 'Будет ли Bitcoin стоить выше $125,000 к концу 2025?',
    titleEn: 'Will Bitcoin be above $125,000 by end of 2025?',
    category: 'CRYPTO',
    imageUrl: 'https://ui-avatars.com/api/?name=Bitcoin&background=000&color=fff&size=128',
    volume: '$45m',
    endDate: '2025-12-31',
    yesPrice: 0.33,
    noPrice: 0.67,
    chance: 33,
    description: "Цена BTC должна быть выше $125,000.00 на бирже Binance в 23:59 UTC 31 декабря 2025 года.",
    history: generateHistory(20, 33),
    comments: MOCK_COMMENTS
  },
  {
    id: '5',
    title: 'Курс доллара выше 110₽ на конец 2025 года?',
    titleRu: 'Курс доллара выше 110₽ на конец 2025 года?',
    titleEn: 'Will USD/RUB exceed 110 by year-end 2025?',
    category: 'WORLD',
    imageUrl: 'https://ui-avatars.com/api/?name=USD+RUB&background=000&color=fff&size=128',
    volume: '$12.1m',
    endDate: '2025-12-31',
    yesPrice: 0.65,
    noPrice: 0.35,
    chance: 65,
    description: "Официальный курс ЦБ РФ на 31 декабря 2025 года должен быть строго выше 110.00 рублей за 1 доллар США.",
    history: generateHistory(50, 65),
    comments: MOCK_COMMENTS
  },
  {
    id: '6',
    title: 'Станет ли ChatGPT приложением №1 в RuStore/AppStore в 2025?',
    titleRu: 'Станет ли ChatGPT приложением №1 в RuStore/AppStore в 2025?',
    titleEn: 'Will ChatGPT hit #1 in RuStore/App Store in 2025?',
    category: 'SOCIAL',
    imageUrl: 'https://ui-avatars.com/api/?name=ChatGPT&background=000&color=fff&size=128',
    volume: '$2.4m',
    endDate: '2025-12-31',
    yesPrice: 0.55,
    noPrice: 0.45,
    chance: 55,
    description: "Если приложение ChatGPT займет 1 место в категории 'Бесплатные' в российском регионе App Store или RuStore хотя бы на 24 часа.",
    history: generateHistory(30, 55),
    comments: MOCK_COMMENTS
  },
  {
    id: '7',
    title: 'Превысит ли выручка Wildberries 4 трлн руб в 2025?',
    titleRu: 'Превысит ли выручка Wildberries 4 трлн руб в 2025?',
    titleEn: 'Will Wildberries revenue exceed 4T RUB in 2025?',
    category: 'WORLD',
    imageUrl: 'https://ui-avatars.com/api/?name=WB&background=000&color=fff&size=128',
    volume: '$1.8m',
    endDate: '2026-04-01',
    yesPrice: 0.70,
    noPrice: 0.30,
    chance: 70,
    description: "На основе официального финансового отчета компании за 2025 год. Оборот (GMV) должен превысить 4,000,000,000,000 рублей.",
    history: generateHistory(60, 70),
    comments: MOCK_COMMENTS
  },
  {
    id: '8',
    title: 'Состояние Олега Тинькова >$900M в конце 2025?',
    titleRu: 'Состояние Олега Тинькова >$900M в конце 2025?',
    titleEn: 'Will Oleg Tinkov’s net worth exceed $900M by end of 2025?',
    category: 'CELEBS',
    imageUrl: 'https://ui-avatars.com/api/?name=Oleg+Tinkov&background=000&color=fff&size=128',
    volume: '$550k',
    endDate: '2025-12-31',
    yesPrice: 0.25,
    noPrice: 0.75,
    chance: 25,
    description: "На основе данных Forbes Real-Time Billionaires List или аналогичного рейтинга Bloomberg на конец 2025 года.",
    history: generateHistory(40, 25),
    comments: MOCK_COMMENTS
  },
];

export const MOCK_LEADERBOARD: LeaderboardUser[] = [
    { 
        id: 'l1', rank: 1, name: 'SatoshiN', avatar: 'https://ui-avatars.com/api/?name=Satoshi&background=111&color=BEFF1D', 
        balance: 145000, pnl: 45200, referrals: 124,
        portfolio: [{ id: 'lp1', marketId: '4', marketTitle: 'BTC > 125k', type: 'YES', shares: 5000, avgPrice: 0.20, currentPrice: 0.33, endDate: '2025-12-31' }] 
    },
    { 
        id: 'l2', rank: 2, name: 'Oracle_X', avatar: 'https://ui-avatars.com/api/?name=Oracle&background=111&color=f544a6', 
        balance: 89000, pnl: 21500, referrals: 45,
        portfolio: [{ id: 'lp2', marketId: '1', marketTitle: 'YouTube 2026', type: 'NO', shares: 2000, avgPrice: 0.70, currentPrice: 0.85, endDate: '2026-01-01' }]
    },
    { 
        id: 'l3', rank: 3, name: 'WhaleWatcher', avatar: 'https://ui-avatars.com/api/?name=Whale&background=111&color=fff', 
        balance: 56000, pnl: 12400, referrals: 12,
        portfolio: [] 
    },
    { 
        id: 'l4', rank: 4, name: 'ElonFan', avatar: 'https://ui-avatars.com/api/?name=Elon&background=111&color=ddd', 
        balance: 42000, pnl: 8900, referrals: 5,
        portfolio: [] 
    },
    { 
        id: 'l5', rank: 5, name: 'BearMarket', avatar: 'https://ui-avatars.com/api/?name=Bear&background=111&color=999', 
        balance: 31000, pnl: -1200, referrals: 0,
        portfolio: [] 
    },
];