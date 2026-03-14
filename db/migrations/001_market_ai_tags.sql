-- Taxonomy (19 tags):
-- crypto, technology, ai, macroeconomics, business, finance, stocks,
-- politics, geopolitics, elections, regulation, science, weather,
-- sports, entertainment, culture, health, energy, legal, world
CREATE TABLE IF NOT EXISTS market_ai_tags (
  id bigint generated always as identity primary key,
  market_id uuid NOT NULL REFERENCES market_catalog(id) ON DELETE CASCADE,
  tag text NOT NULL,
  confidence real NOT NULL DEFAULT 0,
  model text NOT NULL DEFAULT 'gpt-5-nano',
  prompt_version text NOT NULL DEFAULT 'v1',
  snapshot_fingerprint text NOT NULL DEFAULT '',
  classified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, tag, prompt_version, snapshot_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_market_ai_tags_market_id ON market_ai_tags(market_id);
CREATE INDEX IF NOT EXISTS idx_market_ai_tags_tag ON market_ai_tags(tag);
