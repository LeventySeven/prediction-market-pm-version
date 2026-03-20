-- Market-level classification state for the AI tag classifier.
-- One row per market: stores the primary tag, model, prompt version,
-- fingerprint, and timestamp so the classifier can skip unchanged markets.

CREATE TABLE IF NOT EXISTS market_ai_classifications (
  market_id   TEXT PRIMARY KEY REFERENCES market_catalog(id) ON DELETE CASCADE,
  primary_tag TEXT NOT NULL,
  model       TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  snapshot_fingerprint TEXT NOT NULL,
  classified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Speed up lookups by primary_tag for facet counting
CREATE INDEX IF NOT EXISTS idx_market_ai_classifications_primary_tag
  ON market_ai_classifications (primary_tag);

-- Ensure market_ai_tags has a unique constraint so upserts are atomic
-- (idempotent if constraint already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'market_ai_tags_market_id_tag_key'
  ) THEN
    ALTER TABLE market_ai_tags ADD CONSTRAINT market_ai_tags_market_id_tag_key UNIQUE (market_id, tag);
  END IF;
END
$$;
