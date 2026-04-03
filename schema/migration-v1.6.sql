-- MemForge v1.6.0 Migration — Memory Revision Engine foundation
--
-- Adds retrieval event logging, memory revision history, and composite
-- importance scoring. These tables are the data foundation for the
-- sleep cycle processor.
--
-- Run: psql "$DATABASE_URL" -f schema/migration-v1.6.sql
-- Safe to run multiple times (all statements are idempotent).

-- ─── Retrieval event log ─────────────────────────────────────────────────────
-- Every query hit is recorded as a discrete event for reinforcement analysis.
CREATE TABLE IF NOT EXISTS retrieval_log (
  id              BIGSERIAL   PRIMARY KEY,
  agent_id        TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  warm_tier_id    BIGINT      NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  query_text      TEXT        NOT NULL,
  query_mode      TEXT        NOT NULL DEFAULT 'keyword',
  rank_position   INT         NOT NULL DEFAULT 0,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retrieval_log_agent_idx   ON retrieval_log (agent_id);
CREATE INDEX IF NOT EXISTS retrieval_log_warm_idx    ON retrieval_log (warm_tier_id);
CREATE INDEX IF NOT EXISTS retrieval_log_created_idx ON retrieval_log (created_at DESC);

-- ─── Memory revision history ─────────────────────────────────────────────────
-- Tracks every rewrite of a warm-tier memory. Enables convergence analysis.
CREATE TABLE IF NOT EXISTS memory_revisions (
  id               BIGSERIAL   PRIMARY KEY,
  agent_id         TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  warm_tier_id     BIGINT      NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  revision_number  INT         NOT NULL,
  previous_content TEXT        NOT NULL,
  new_content      TEXT        NOT NULL,
  revision_type    TEXT        NOT NULL CHECK (revision_type IN ('augment', 'correct', 'merge', 'compress')),
  reason           TEXT        NOT NULL DEFAULT '',
  delta_summary    TEXT        NOT NULL DEFAULT '',
  confidence       REAL        NOT NULL DEFAULT 0.5,
  model_used       TEXT        NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_revisions_agent_idx ON memory_revisions (agent_id);
CREATE INDEX IF NOT EXISTS memory_revisions_warm_idx  ON memory_revisions (warm_tier_id);

-- ─── Composite importance scoring columns on warm_tier ───────────────────────
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS importance      REAL NOT NULL DEFAULT 0.5;
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS confidence      REAL NOT NULL DEFAULT 0.5;
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS revision_count  INT  NOT NULL DEFAULT 0;

-- ─── Index for importance-based queries and eviction ─────────────────────────
CREATE INDEX IF NOT EXISTS warm_tier_importance_idx ON warm_tier (agent_id, importance DESC);
