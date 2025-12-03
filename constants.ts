
import { Market, Category, HistoryPoint, Comment } from './types';

export const ACCENT_COLOR = '#BEFF1D';

export const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'ALL', label: 'Все', icon: '🌐' },
  { id: 'POLITICS', label: 'Политика', icon: '⚖️' },
  { id: 'CRYPTO', label: 'Крипта', icon: '₿' },
  { id: 'CELEBS', label: 'Селебрити', icon: '✨' },
  { id: 'SCIENCE', label: 'Наука', icon: '🧬' },
  { id: 'SOCIAL', label: 'Соц сети', icon: '📱' },
  { id: 'MUSIC', label: 'Музыка', icon: '🎵' },
  { id: 'ELECTIONS', label: 'Выборы', icon: '🗳️' },
  { id: 'WORLD', label: 'Мировые', icon: '🌍' },
];

// Helper to generate fake history graph data
const generateHistory = (startChance: number, endChance: number): HistoryPoint[] => {
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
    { id: 'c1', user: 'CryptoKing', avatar: 'https://ui-avatars.com/api/?name=CK&background=random', text: 'Думаю шансы занижены, буду покупать YES', timestamp: '2ч назад', likes: 12 },
    { id: 'c2', user: 'Ivan2004', avatar: 'https://ui-avatars.com/api/?name=I2&background=random', text: 'Не верю в это, слишком рискованно', timestamp: '5ч назад', likes: 5 },
    { id: 'c3', user: 'ArbitrageBot', avatar: 'https://ui-avatars.com/api/?name=AB&background=random', text: 'Ликвидность отличная, залетаю', timestamp: '1д назад', likes: 8 },
];

const STANDARD_RULES = "Этот рынок будет разрешен на основе информации из надежных источников (официальные заявления, крупные СМИ). Если событие не произойдет до указанной даты, выигрывает НЕТ. Ставки принимаются до момента официального объявления или закрытия рынка.";

export const MOCK_MARKETS: Market[] = [
  {
    id: '1',
    title: 'Разблокируют ли YouTube в РФ до Января 2026?',
    category: 'SOCIAL',
    imageUrl: 'https://ui-avatars.com/api/?name=YouTube&background=ff0000&color=fff&size=128&font-size=0.4',
    volume: '$3.2m',
    endDate: '1 Янв 2026',
    yesPrice: 0.15,
    noPrice: 0.85,
    chance: 15,
    description: "Рынок разрешается положительно, если YouTube станет полностью доступен без VPN через основных провайдеров РФ до 1 января 2026 года. Официальное заявление РКН или правительства также будет считаться подтверждением.",
    history: generateHistory(40, 15),
    comments: MOCK_COMMENTS
  },
  {
    id: '2',
    title: 'Привлекут ли Долину к ответственности за схему с квартирой?',
    category: 'CELEBS',
    imageUrl: 'https://ui-avatars.com/api/?name=Larisa+Dolina&background=random&color=fff&size=128',
    volume: '$840k',
    endDate: '31 Дек 2024',
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
    category: 'MUSIC',
    imageUrl: 'https://ui-avatars.com/api/?name=Ivan+Zolo&background=ffcc00&color=000&size=128',
    volume: '$125k',
    endDate: '28 Фев 2025',
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
    category: 'CRYPTO',
    imageUrl: 'https://ui-avatars.com/api/?name=Bitcoin&background=f7931a&color=fff&size=128',
    volume: '$45m',
    endDate: '31 Дек 2025',
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
    category: 'WORLD',
    imageUrl: 'https://ui-avatars.com/api/?name=USD+RUB&background=22c55e&color=fff&size=128',
    volume: '$12.1m',
    endDate: '31 Дек 2025',
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
    category: 'SOCIAL',
    imageUrl: 'https://ui-avatars.com/api/?name=ChatGPT&background=10a37f&color=fff&size=128',
    volume: '$2.4m',
    endDate: '31 Дек 2025',
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
    category: 'WORLD',
    imageUrl: 'https://ui-avatars.com/api/?name=WB&background=990099&color=fff&size=128',
    volume: '$1.8m',
    endDate: '1 Апр 2026',
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
    category: 'CELEBS',
    imageUrl: 'https://ui-avatars.com/api/?name=Oleg+Tinkov&background=ffdd00&color=000&size=128',
    volume: '$550k',
    endDate: '31 Дек 2025',
    yesPrice: 0.25,
    noPrice: 0.75,
    chance: 25,
    description: "На основе данных Forbes Real-Time Billionaires List или аналогичного рейтинга Bloomberg на конец 2025 года.",
    history: generateHistory(40, 25),
    comments: MOCK_COMMENTS
  },
];