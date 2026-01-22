import { Annotation, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
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

const buildSearchQueryPrompt = (language: "RU" | "EN") =>
  new SystemMessage(
    language === "RU"
      ? [
          "Ты исследователь рынка прогнозов.",
          "Сформируй поисковый запрос по названию, описанию и источнику рынка.",
          "Верни ТОЛЬКО JSON вида:",
          '{"query": "строка запроса", "keywords": ["ключ1", "ключ2"]}',
          "Запрос должен быть точным, без лишних слов."
        ].join("\n")
      : [
          "You are a prediction market research assistant.",
          "Create a concise search query from the market title, description, and source.",
          "Return ONLY JSON:",
          '{"query": "search query", "keywords": ["kw1", "kw2"]}',
          "Keep it precise and information-seeking."
        ].join("\n")
  );

const buildSynthesisPrompt = (language: "RU" | "EN") =>
  new SystemMessage(
    language === "RU"
      ? [
          "Ты исследователь, пишущий контекст для рынка прогнозов.",
          "Используй ТОЛЬКО предоставленные источники и выдержки.",
          "Не выдумывай факты. Если данных мало — так и скажи.",
          "Формат: 1-3 коротких абзаца, без списков, язык русский.",
          "Если контекста нет: 'Рынок слишком новый или нишевый — информации для контекста пока нет.'"
        ].join("\n")
      : [
          "You are a research agent writing context for a prediction market.",
          "Use ONLY the provided sources/snippets. Do not invent facts.",
          "Format: 1-3 short paragraphs, no lists, in English.",
          "If there is no reliable info, reply:",
          "'The market is too new or niche, so there is no reliable context yet.'"
        ].join("\n")
  );

const MarketContextState = Annotation.Root({
  marketId: Annotation<string>(),
  title: Annotation<string>(),
  description: Annotation<string | null>(),
  source: Annotation<string | null>(),
  language: Annotation<"RU" | "EN">(),
  query: Annotation<string>(),
  webResults: Annotation<WebResult[]>({
    default: () => [],
    reducer: (prev, next) => prev.concat(next ?? []),
  }),
  arxivResults: Annotation<ArxivResult[]>({
    default: () => [],
    reducer: (prev, next) => prev.concat(next ?? []),
  }),
  pages: Annotation<PageExtract[]>({
    default: () => [],
    reducer: (prev, next) => prev.concat(next ?? []),
  }),
  context: Annotation<string>(),
  sources: Annotation<string[]>({
    default: () => [],
    reducer: (prev, next) => prev.concat(next ?? []),
  }),
});

const createMarketContextGraph = () => {
  const llm = new ChatOpenAI({
    model: "gpt-5",
  });

  const buildQuery = async (state: typeof MarketContextState.State) => {
    const language = state.language;
    const response = await llm.invoke([
      buildSearchQueryPrompt(language),
      new HumanMessage(
        JSON.stringify(
          {
            title: state.title,
            description: state.description,
            source: state.source,
          },
          null,
          2
        )
      ),
    ]);

    const raw = typeof response.content === "string" ? response.content : "";
    const parsed = safeJsonParse(raw);
    const fallbackQuery = [state.title, state.description, state.source]
      .filter(Boolean)
      .join(" ");

    return {
      query: parsed?.query?.trim() || fallbackQuery.trim(),
    };
  };

  const searchWeb = async (state: typeof MarketContextState.State) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey || !state.query) {
      return { webResults: [] as WebResult[] };
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: state.query,
        search_depth: "advanced",
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      return { webResults: [] as WebResult[] };
    }

    const payload = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    const results = (payload.results ?? [])
      .map((item) => ({
        title: item.title ?? "",
        url: item.url ?? "",
        snippet: item.content ?? "",
      }))
      .filter((item) => item.url.length > 0);

    return { webResults: results };
  };

  const searchArxiv = async (state: typeof MarketContextState.State) => {
    if (!state.query) {
      return { arxivResults: [] as ArxivResult[] };
    }

    const query = encodeURIComponent(state.query);
    const response = await fetch(
      `https://export.arxiv.org/api/query?search_query=all:${query}&start=0&max_results=5`
    );

    if (!response.ok) {
      return { arxivResults: [] as ArxivResult[] };
    }

    const xml = await response.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml) as {
      feed?: { entry?: unknown };
    };

    const entries = parsed.feed?.entry;
    const list = Array.isArray(entries) ? entries : entries ? [entries] : [];

    const results = list
      .map((entry) => {
        const record = entry as {
          title?: string;
          summary?: string;
          id?: string;
          published?: string;
          author?: Array<{ name?: string }> | { name?: string };
        };

        const authorsRaw = record.author;
        const authorsList = Array.isArray(authorsRaw)
          ? authorsRaw
          : authorsRaw
          ? [authorsRaw]
          : [];

        return {
          title: String(record.title ?? "").replace(/\s+/g, " ").trim(),
          summary: String(record.summary ?? "").replace(/\s+/g, " ").trim(),
          url: String(record.id ?? "").trim(),
          published: String(record.published ?? "").trim(),
          authors: authorsList
            .map((a) => String(a?.name ?? "").trim())
            .filter((name) => name.length > 0),
        };
      })
      .filter((entry) => entry.url.length > 0);

    return { arxivResults: results };
  };

  const fetchPages = async (state: typeof MarketContextState.State) => {
    const urls = Array.from(new Set(state.webResults.map((r) => r.url))).slice(0, 3);
    if (urls.length === 0) {
      return { pages: [] as PageExtract[] };
    }

    const pages: PageExtract[] = [];
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const html = await response.text();
        const { title, text } = extractTextWithSoup(html);
        if (!text) continue;
        pages.push({
          url,
          title,
          text: text.slice(0, 2000),
        });
      } catch {
        // ignore fetch/parse failures
      }
    }

    return { pages };
  };

  const synthesize = async (state: typeof MarketContextState.State) => {
    const hasSources =
      state.webResults.length > 0 ||
      state.arxivResults.length > 0 ||
      state.pages.length > 0;

    const sources = Array.from(
      new Set([
        ...state.webResults.map((r) => r.url),
        ...state.arxivResults.map((r) => r.url),
      ])
    );

    if (!hasSources) {
      const fallback =
        state.language === "RU"
          ? "Рынок слишком новый или нишевый — информации для контекста пока нет."
          : "The market is too new or niche, so there is no reliable context yet.";
      return { context: fallback, sources };
    }

    const response = await llm.invoke([
      buildSynthesisPrompt(state.language),
      new HumanMessage(
        JSON.stringify(
          {
            market: {
              title: state.title,
              description: state.description,
              source: state.source,
            },
            webResults: state.webResults,
            arxivResults: state.arxivResults,
            pageExtracts: state.pages.map((p) => ({
              url: p.url,
              title: p.title,
              text: p.text.slice(0, 800),
            })),
          },
          null,
          2
        )
      ),
    ]);

    const content = typeof response.content === "string" ? response.content.trim() : "";
    const fallback =
      state.language === "RU"
        ? "Рынок слишком новый или нишевый — информации для контекста пока нет."
        : "The market is too new or niche, so there is no reliable context yet.";

    return { context: content || fallback, sources };
  };

  return new StateGraph(MarketContextState)
    .addNode("buildQuery", buildQuery)
    .addNode("searchWeb", searchWeb)
    .addNode("searchArxiv", searchArxiv)
    .addNode("fetchPages", fetchPages)
    .addNode("synthesize", synthesize)
    .addEdge("__start__", "buildQuery")
    .addEdge("buildQuery", "searchWeb")
    .addEdge("searchWeb", "searchArxiv")
    .addEdge("searchArxiv", "fetchPages")
    .addEdge("fetchPages", "synthesize")
    .addEdge("synthesize", "__end__")
    .compile();
};

let cachedGraph: ReturnType<typeof createMarketContextGraph> | null = null;

export const generateMarketContext = async (input: MarketContextInput): Promise<MarketContextOutput> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  if (!cachedGraph) {
    cachedGraph = createMarketContextGraph();
  }

  const title = input.title.trim();
  const description = input.description?.trim() || null;
  const source = input.source?.trim() || null;
  const language = detectLanguage([title, description].filter(Boolean).join(" "));

  const finalState = await cachedGraph.invoke({
    marketId: input.marketId,
    title,
    description,
    source,
    language,
  });

  return {
    context: finalState.context,
    sources: Array.from(new Set(finalState.sources)).filter((url) => url.length > 0),
  };
};
