-- MemForge v1.4.0 Migration — Reflection & Self-Learning
--
-- Run against an existing v1.3.0 database:
--   psql "$DATABASE_URL" -f schema/migration-v1.4.sql
--
-- Safe to run multiple times (all statements are idempotent).

-- ─── reflections — synthesized insights ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS reflections (
  id              BIGSERIAL   PRIMARY KEY,
  agent_id        TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content         TEXT        NOT NULL,
  key_insights    TEXT[]      NOT NULL DEFAULT '{}',
  contradictions  TEXT[]      NOT NULL DEFAULT '{}',
  source_warm_ids BIGINT[]    NOT NULL DEFAULT '{}',
  trigger_type    TEXT        NOT NULL DEFAULT 'manual'
                                CHECK (trigger_type IN ('manual', 'threshold', 'scheduled')),
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reflections_agent_id_idx  ON reflections (agent_id);
CREATE INDEX IF NOT EXISTS reflections_created_idx   ON reflections (created_at DESC);
