-- MemForge v2.0.0 Migration — Memory Revision Engine + Temporal Edges + Procedural Memory
--
-- Run: psql "$DATABASE_URL" -f schema/migration-v2.0.sql
-- Safe to run multiple times (all statements are idempotent).
-- Includes all changes from migration-v1.6.sql plus temporal edges and procedures.

-- ─── Retrieval event log ─────────────────────────────────────────────────────
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

-- ─── Composite importance scoring on warm_tier ───────────────────────────────
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS importance      REAL NOT NULL DEFAULT 0.5;
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS confidence      REAL NOT NULL DEFAULT 0.5;
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS revision_count  INT  NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS warm_tier_importance_idx ON warm_tier (agent_id, importance DESC);

-- ─── Temporal edge annotations on relationships ──────────────────────────────
ALTER TABLE relationships ADD COLUMN IF NOT EXISTS valid_from  TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE relationships ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

-- ─── Procedural memory ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procedures (
  id                    BIGSERIAL   PRIMARY KEY,
  agent_id              TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  condition             TEXT        NOT NULL,
  action                TEXT        NOT NULL,
  source_reflection_id  BIGINT      REFERENCES reflections(id) ON DELETE SET NULL,
  confidence            REAL        NOT NULL DEFAULT 0.5,
  access_count          INT         NOT NULL DEFAULT 0,
  last_accessed         TIMESTAMPTZ,
  active                BOOLEAN     NOT NULL DEFAULT true,
  metadata              JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS procedures_agent_idx  ON procedures (agent_id);
CREATE INDEX IF NOT EXISTS procedures_active_idx ON procedures (agent_id, active) WHERE active = true;
