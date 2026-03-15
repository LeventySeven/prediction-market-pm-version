import OpenAI from "openai";
import JSSoup from "jssoup";
import { XMLParser } from "fast-xml-parser";

type WebResult = {
  title: string;
  url: string;
  snippet: string;
};

type ArxivResult = {
  title: string;
  url: string;
  summary: string;
  authors: string[];
  published: string;
};

type PageExtract = {
  url: string;
  title: string | null;
  text: string;
};

type MarketContextInput = {
  marketId: string;
  title: string;
  description?: string | null;
  source?: string | null;
};

type MarketContextOutput = {
  context: string;
  sources: string[];
};

const detectLanguage = (value: string) => (/[\u0400-\u04FF]/.test(value) ? "RU" : "EN");

const normalizeText = (value: string) =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractTextWithSoup = (html: string) => {
  const soup = new JSSoup(html);
  const soupAny = soup as unknown as {
    text?: string | (() => string);
    getText?: () => string;
    find?: (selector: string) => { text?: string } | null;
  };

  const title =
    typeof soupAny.find === "function" ? soupAny.find("title")?.text ?? null : null;

  const textCandidate =
    typeof soupAny.text === "string"
      ? soupAny.text
      : typeof soupAny.text === "function"
      ? soupAny.text()
      : typeof soupAny.getText === "function"
      ? soupAny.getText()
      : "";

  return {
    title,
    text: normalizeText(textCandidate),
  };
};

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value) as { query?: string; keywords?: string[] } | null;
  } catch {
    return null;
  }
};

const SEARCH_QUERY_PROMPT_RU = [
  "Ты исследователь рынка прогнозов.",
  "Сформируй поисковый запрос по названию, описанию и источнику рынка.",
  "Верни ТОЛЬКО JSON вида:",
  '{"query": "строка запроса", "keywords": ["ключ1", "ключ2"]}',
  "Запрос должен быть точным, без лишних слов."
].join("\n");

const SEARCH_QUERY_PROMPT_EN = [
  "You are a prediction market research assistant.",
  "Create a concise search query from the market title, description, and source.",
  "Return ONLY JSON:",
  '{"query": "search query", "keywords": ["kw1", "kw2"]}',
  "Keep it precise and information-seeking."
].join("\n");

const SYNTHESIS_PROMPT_RU = [
  "Ты исследователь, пишущий контекст для рынка прогнозов.",
  "Используй ТОЛЬКО предоставленные источники и выдержки.",
  "Не выдумывай факты. Если данных мало — так и скажи.",
  "Сделай контекст короче и точнее: 1-2 коротких абзаца, без списков, язык русский.",
  "Фокус на ключевых фактах, только самое релевантное.",
  "Если контекста нет: 'Рынок слишком новый или нишевый — информации для контекста пока нет.'"
].join("\n");

const SYNTHESIS_PROMPT_EN = [
  "You are a research agent writing context for a prediction market.",
  "Use ONLY the provided sources/snippets. Do not invent facts.",
  "Keep it short and specific: 1-2 short paragraphs, no lists, in English.",
  "Focus only on the most relevant facts.",
  "If there is no reliable info, reply:",
  "'The market is too new or niche, so there is no reliable context yet.'"
].join("\n");

let openaiClient: OpenAI | null = null;

const getOpenAI = (): OpenAI => {
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
};

const buildQuery = async (
  title: string,
  description: string | null,
  source: string | null,
  language: "RU" | "EN"
): Promise<string> => {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: language === "RU" ? SEARCH_QUERY_PROMPT_RU : SEARCH_QUERY_PROMPT_EN },
      { role: "user", content: JSON.stringify({ title, description, source }, null, 2) },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  const raw = response.choices[0]?.message?.content ?? "";
  const parsed = safeJsonParse(raw);
  const fallback = [title, description, source].filter(Boolean).join(" ");
  return parsed?.query?.trim() || fallback.trim();
};

const searchWeb = async (query: string): Promise<WebResult[]> => {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || !query) return [];

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  return (payload.results ?? [])
    .map((item) => ({
      title: item.title ?? "",
      url: item.url ?? "",
      snippet: item.content ?? "",
    }))
    .filter((item) => item.url.length > 0);
};

const searchArxiv = async (query: string): Promise<ArxivResult[]> => {
  if (!query) return [];

  const encoded = encodeURIComponent(query);
  const response = await fetch(
    `https://export.arxiv.org/api/query?search_query=all:${encoded}&start=0&max_results=5`
  );

  if (!response.ok) return [];

  const xml = await response.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml) as { feed?: { entry?: unknown } };

  const entries = parsed.feed?.entry;
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];

  return list
    .map((entry) => {
      const record = entry as {
        title?: string;
        summary?: string;
        id?: string;
        published?: string;
        author?: Array<{ name?: string }> | { name?: string };
      };

      const authorsRaw = record.author;
      const authorsList = Array.isArray(authorsRaw) ? authorsRaw : authorsRaw ? [authorsRaw] : [];

      return {
        title: String(record.title ?? "").replace(/\s+/g, " ").trim(),
        summary: String(record.summary ?? "").replace(/\s+/g, " ").trim(),
        url: String(record.id ?? "").trim(),
        published: String(record.published ?? "").trim(),
        authors: authorsList.map((a) => String(a?.name ?? "").trim()).filter(Boolean),
      };
    })
    .filter((entry) => entry.url.length > 0);
};

const fetchPages = async (webResults: WebResult[]): Promise<PageExtract[]> => {
  const urls = Array.from(new Set(webResults.map((r) => r.url))).slice(0, 3);
  if (urls.length === 0) return [];

  const pages: PageExtract[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const html = await response.text();
      const { title, text } = extractTextWithSoup(html);
      if (!text) continue;
      pages.push({ url, title, text: text.slice(0, 2000) });
    } catch {
      // ignore fetch/parse failures
    }
  }

  return pages;
};

const synthesize = async (
  title: string,
  description: string | null,
  source: string | null,
  language: "RU" | "EN",
  webResults: WebResult[],
  arxivResults: ArxivResult[],
  pages: PageExtract[]
): Promise<{ context: string; sources: string[] }> => {
  const hasSources = webResults.length > 0 || arxivResults.length > 0 || pages.length > 0;

  const sources = Array.from(
    new Set([
      ...pages.map((p) => p.url),
      ...webResults.map((r) => r.url),
      ...arxivResults.map((r) => r.url),
    ])
  ).slice(0, 3);

  const fallback =
    language === "RU"
      ? "Рынок слишком новый или нишевый — информации для контекста пока нет."
      : "The market is too new or niche, so there is no reliable context yet.";

  if (!hasSources) {
    return { context: fallback, sources };
  }

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: language === "RU" ? SYNTHESIS_PROMPT_RU : SYNTHESIS_PROMPT_EN },
      {
        role: "user",
        content: JSON.stringify(
          {
            market: { title, description, source },
            webResults,
            arxivResults,
            pageExtracts: pages.map((p) => ({
              url: p.url,
              title: p.title,
              text: p.text.slice(0, 800),
            })),
          },
          null,
          2
        ),
      },
    ],
    temperature: 0.4,
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content?.trim() ?? "";
  return { context: content || fallback, sources };
};

export const generateMarketContext = async (input: MarketContextInput): Promise<MarketContextOutput> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const title = input.title.trim();
  const description = input.description?.trim() || null;
  const source = input.source?.trim() || null;
  const language = detectLanguage([title, description].filter(Boolean).join(" "));

  // Sequential pipeline: query → search (parallel) → fetch pages → synthesize
  const query = await buildQuery(title, description, source, language);

  const [webResults, arxivResults] = await Promise.all([
    searchWeb(query),
    searchArxiv(query),
  ]);

  const pages = await fetchPages(webResults);

  const result = await synthesize(title, description, source, language, webResults, arxivResults, pages);

  return {
    context: result.context,
    sources: Array.from(new Set(result.sources)).filter((url) => url.length > 0),
  };
};
