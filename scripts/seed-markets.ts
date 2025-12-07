/**
 * Seed Supabase markets table with demo data.
 * Usage (Bun):
 *  AUTH_JWT_SECRET=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun tsx scripts/seed-markets.ts
 *
 * Requires env vars:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

type SeedMarket = {
  title: string;
  description: string | null;
  pool_yes: number;
  pool_no: number;
  expires_at: string; // ISO
  outcome: "YES" | "NO" | null;
};

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Simplified seed data derived from the frontend mock markets.
const seeds: SeedMarket[] = [
  {
    title: "Разблокируют ли YouTube в РФ до Января 2026?",
    description:
      "Рынок разрешается положительно, если YouTube станет полностью доступен без VPN через основных провайдеров РФ до 1 января 2026 года.",
    pool_yes: 15,
    pool_no: 85,
    expires_at: "2026-01-01T00:00:00.000Z",
    outcome: null,
  },
  {
    title: "Привлекут ли Долину к ответственности за схему с квартирой?",
    description:
      "Официальное обвинение до конца 2024 года в связи с недавней сделкой с недвижимостью.",
    pool_yes: 42,
    pool_no: 58,
    expires_at: "2024-12-31T00:00:00.000Z",
    outcome: null,
  },
  {
    title: 'Займет ли песня "Баобаб" (Ivan Zolo) топ-1 в Яндекс Музыке?',
    description:
      "Если трек достигнет 1 места в официальном чарте Яндекс Музыки до указанной даты.",
    pool_yes: 8,
    pool_no: 92,
    expires_at: "2025-02-28T00:00:00.000Z",
    outcome: null,
  },
  {
    title: "Будет ли Bitcoin стоить выше $125,000 к концу 2025?",
    description:
      "Цена BTC должна быть выше $125,000.00 на бирже Binance в 23:59 UTC 31 декабря 2025 года.",
    pool_yes: 33,
    pool_no: 67,
    expires_at: "2025-12-31T00:00:00.000Z",
    outcome: null,
  },
  {
    title: "Курс доллара выше 110₽ на конец 2025 года?",
    description:
      "Официальный курс ЦБ РФ на 31 декабря 2025 года должен быть строго выше 110 рублей.",
    pool_yes: 65,
    pool_no: 35,
    expires_at: "2025-12-31T00:00:00.000Z",
    outcome: null,
  },
  {
    title: "Станет ли ChatGPT приложением №1 в RuStore/AppStore в 2025?",
    description:
      "Если приложение ChatGPT займет 1 место в категории 'Бесплатные' в российском регионе хотя бы на 24 часа.",
    pool_yes: 55,
    pool_no: 45,
    expires_at: "2025-12-31T00:00:00.000Z",
    outcome: null,
  },
  {
    title: "Превысит ли выручка Wildberries 4 трлн руб в 2025?",
    description:
      "GMV должен превысить 4 трлн рублей по официальному отчету за 2025 год.",
    pool_yes: 70,
    pool_no: 30,
    expires_at: "2026-04-01T00:00:00.000Z",
    outcome: null,
  },
  {
    title: "Состояние Олега Тинькова >$900M в конце 2025?",
    description:
      "На основе данных Forbes/Bloomberg на конец 2025 года.",
    pool_yes: 25,
    pool_no: 75,
    expires_at: "2025-12-31T00:00:00.000Z",
    outcome: null,
  },
];

async function main() {
  const { data, error } = await supabase.from("markets").insert(seeds).select("id");
  if (error) {
    console.error("Insert error:", error);
    process.exit(1);
  }
  const insertedCount = Array.isArray(data) ? data.length : 0;
  console.log(`Inserted ${insertedCount} markets`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

