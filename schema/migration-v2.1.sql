-- MemForge v2.1.0 Migration — Downstream Outcome Feedback + Entity Dedup + Meta-Reflection + Active Memory

-- ─── Feedback: add outcome tracking to retrieval_log ─────────────────────────
ALTER TABLE retrieval_log ADD COLUMN IF NOT EXISTS outcome TEXT CHECK (outcome IN ('positive', 'negative', 'neutral'));
ALTER TABLE retrieval_log ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;
ALTER TABLE retrieval_log ADD COLUMN IF NOT EXISTS feedback_metadata JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS retrieval_log_outcome_idx ON retrieval_log (agent_id, outcome) WHERE outcome IS NOT NULL;

-- ─── Meta-reflections: add level and parent tracking ─────────────────────────
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS reflection_level INT NOT NULL DEFAULT 1;
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS source_reflection_ids BIGINT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS reflections_level_idx ON reflections (agent_id, reflection_level);
