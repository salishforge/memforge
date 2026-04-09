-- MemForge Migration v2.6 — Active Knowledge Management
--
-- 1. Memory conflict pairs (#80)
-- 2. Temporal event chains (#76)
-- 3. Surprise score for prioritized replay (#79)
-- 4. Knowledge gap tracking (#77)
-- 5. Staleness tracking (#78)
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v2.6.sql

-- ─── #80: Memory conflict pairs ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_conflicts (
  id                 BIGSERIAL PRIMARY KEY,
  agent_id           TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  warm_tier_id_a     BIGINT NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  warm_tier_id_b     BIGINT NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  contradiction_type TEXT NOT NULL DEFAULT 'factual',
  severity           REAL NOT NULL DEFAULT 0.5,
  resolved           BOOLEAN NOT NULL DEFAULT false,
  winner_id          BIGINT REFERENCES warm_tier(id),
  resolution_strategy TEXT,
  detected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS memory_conflicts_agent_idx ON memory_conflicts (agent_id, resolved);

-- ─── #76: Temporal event chains ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_sequences (
  id              BIGSERIAL PRIMARY KEY,
  agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  predecessor_id  BIGINT NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  successor_id    BIGINT NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  gap_seconds     REAL,
  UNIQUE (agent_id, predecessor_id, successor_id)
);
CREATE INDEX IF NOT EXISTS memory_sequences_pred_idx ON memory_sequences (predecessor_id);
CREATE INDEX IF NOT EXISTS memory_sequences_succ_idx ON memory_sequences (successor_id);

-- ─── #79: Surprise score for prioritized replay ─────────────────────────────

ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS surprise_score REAL NOT NULL DEFAULT 0;

-- ─── #77: Knowledge gap tracking ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id          BIGSERIAL PRIMARY KEY,
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  query_text  TEXT NOT NULL,
  gap_type    TEXT NOT NULL DEFAULT 'no_results',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved    BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS knowledge_gaps_agent_idx ON knowledge_gaps (agent_id, resolved);

-- ─── #78: Staleness tracking ────────────────────────────────────────────────

ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS staleness_score REAL NOT NULL DEFAULT 0;
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS last_corroborated TIMESTAMPTZ;
