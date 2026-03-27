import { TAXONOMY_TAGS, type TaxonomyTagId } from "./taxonomy";

/**
 * Fast, deterministic keyword-based taxonomy matcher.
 * Assigns a primary tag to any market instantly based on title + description.
 * Runs inline (no AI call, no async) so every market gets a tag on arrival.
 * The AI classifier can override later with better tags.
 */

type MatchRule = {
  tag: TaxonomyTagId;
  keywords: string[];
  weight: number;
};

const RULES: MatchRule[] = [
  { tag: "crypto", weight: 3, keywords: ["bitcoin", "btc", "ethereum", "eth", "solana", "sol", "crypto", "token", "blockchain", "defi", "nft", "memecoin", "altcoin", "stablecoin", "usdc", "usdt", "binance", "coinbase", "doge", "xrp", "cardano", "polygon", "matic", "avalanche", "tron", "litecoin", "tge", "airdrop"] },
  { tag: "ai", weight: 3, keywords: ["artificial intelligence", " ai ", "openai", "chatgpt", "gpt-", "claude", "gemini", "llm", "machine learning", "deepmind", "anthropic", "midjourney", "stable diffusion", "neural", "agi"] },
  { tag: "technology", weight: 2, keywords: ["tech", "apple", "google", "microsoft", "amazon", "meta", "nvidia", "tesla", "spacex", "iphone", "android", "software", "hardware", "chip", "semiconductor", "starlink"] },
  { tag: "politics", weight: 2, keywords: ["president", "congress", "senate", "republican", "democrat", "political", "government", "legislation", "impeach", "pardon", "executive order", "white house", "cabinet", "governor"] },
  { tag: "elections", weight: 3, keywords: ["election", "vote", "ballot", "primary", "nominee", "candidate", "poll", "electoral", "campaign", "midterm", "runoff", "presidential race"] },
  { tag: "geopolitics", weight: 2, keywords: ["war", "nato", "ukraine", "russia", "china", "taiwan", "sanction", "military", "invasion", "ceasefire", "treaty", "nuclear", "missile", "iran", "north korea", "conflict", "territory"] },
  { tag: "stocks", weight: 2, keywords: ["stock", "shares", "nasdaq", "s&p", "dow jones", "ipo", "earnings", "market cap", "nyse", "ticker", "share price"] },
  { tag: "finance", weight: 1, keywords: ["interest rate", "federal reserve", "fed ", "inflation", "gdp", "recession", "bond", "yield", "treasury", "central bank", "monetary", "fiscal"] },
  { tag: "macroeconomics", weight: 1, keywords: ["economy", "economic", "unemployment", "cpi", "ppi", "trade deficit", "tariff", "debt ceiling", "stimulus"] },
  { tag: "business", weight: 1, keywords: ["company", "merger", "acquisition", "ceo", "startup", "revenue", "profit", "bankrupt", "layoff", "valuation", "funding"] },
  { tag: "sports", weight: 2, keywords: ["nba", "nfl", "mlb", "nhl", "soccer", "football", "basketball", "baseball", "tennis", "golf", "ufc", "mma", "boxing", "f1", "formula 1", "grand prix", "champions league", "world cup", "premier league", "super bowl", "playoff", "championship", "match", "tournament", "athlete", "coach", "esports", "league of legends", "dota", "csgo", "valorant"] },
  { tag: "entertainment", weight: 2, keywords: ["movie", "film", "oscar", "grammy", "emmy", "netflix", "disney", "spotify", "youtube", "tiktok", "celebrity", "album", "concert", "box office", "streaming", "tv show", "series", "award", "music"] },
  { tag: "culture", weight: 1, keywords: ["culture", "social media", "viral", "meme", "trend", "influencer", "twitter", "instagram", "reddit", "podcast"] },
  { tag: "science", weight: 2, keywords: ["science", "nasa", "space", "mars", "moon", "climate", "research", "discovery", "physics", "biology", "vaccine", "study", "experiment", "asteroid"] },
  { tag: "health", weight: 2, keywords: ["health", "covid", "pandemic", "virus", "disease", "fda", "drug", "pharmaceutical", "hospital", "medical", "who ", "outbreak", "treatment", "cancer"] },
  { tag: "energy", weight: 2, keywords: ["oil", "gas", "opec", "renewable", "solar", "wind", "nuclear energy", "pipeline", "petroleum", "barrel", "energy"] },
  { tag: "regulation", weight: 2, keywords: ["regulation", "sec", "regulatory", "compliance", "ban", "law", "legal", "court", "ruling", "supreme court", "antitrust", "ftc"] },
  { tag: "legal", weight: 2, keywords: ["lawsuit", "trial", "verdict", "guilty", "sentence", "indictment", "prosecution", "attorney", "judge", "jury", "appeal"] },
  { tag: "weather", weight: 3, keywords: ["weather", "hurricane", "tornado", "flood", "earthquake", "wildfire", "storm", "temperature", "drought", "snowfall"] },
  { tag: "world", weight: 1, keywords: ["global", "international", "united nations", "eu ", "european", "asia", "africa", "middle east", "latin america", "india", "japan", "korea", "brazil", "mexico", "uk ", "britain", "france", "germany"] },
];

/**
 * Match a market to its best taxonomy tag based on title + description.
 * Returns the tag ID with highest keyword match score, or "world" as default.
 */
export const matchTaxonomyTag = (
  title: string,
  description?: string | null
): TaxonomyTagId => {
  const text = ` ${(title ?? "").toLowerCase()} ${(description ?? "").toLowerCase()} `;
  let bestTag: TaxonomyTagId = "world";
  let bestScore = 0;

  for (const rule of RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (text.includes(kw)) score += rule.weight;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTag = rule.tag;
    }
  }

  return bestTag;
};
