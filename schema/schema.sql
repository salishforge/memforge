-- MemForge Standalone — PostgreSQL Schema
-- Five-table design: hot_tier, warm_tier, cold_tier, consolidation_log, agents

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────────────────────────────────────
-- agents — registry of all known agents (multi-tenant anchor)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id           TEXT        PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata     JSONB       NOT NULL DEFAULT '{}'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- hot_tier — recent raw events (write-heavy, fast ingestion)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hot_tier (
  id           BIGSERIAL   PRIMARY KEY,
  agent_id     TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content      TEXT        NOT NULL,
  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hot_tier_agent_id_idx   ON hot_tier (agent_id);
CREATE INDEX IF NOT EXISTS hot_tier_created_at_idx ON hot_tier (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- warm_tier — consolidated, full-text-searchable memory
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warm_tier (
  id                  BIGSERIAL   PRIMARY KEY,
  agent_id            TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content             TEXT        NOT NULL,
  content_tsv         TSVECTOR    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  source_hot_ids      BIGINT[]    NOT NULL DEFAULT '{}',  -- hot_tier rows this came from
  metadata            JSONB       NOT NULL DEFAULT '{}',
  consolidated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warm_tier_agent_id_idx ON warm_tier (agent_id);
CREATE INDEX IF NOT EXISTS warm_tier_tsv_idx      ON warm_tier USING GIN (content_tsv);
CREATE INDEX IF NOT EXISTS warm_tier_hot_ids_idx  ON warm_tier USING GIN (source_hot_ids);

-- ─────────────────────────────────────────────────────────────────────────────
-- cold_tier — archived / cleared memory (audit trail, never hard-deleted)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cold_tier (
  id              BIGSERIAL   PRIMARY KEY,
  agent_id        TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  source_table    TEXT        NOT NULL CHECK (source_table IN ('hot_tier', 'warm_tier')),
  source_id       BIGINT      NOT NULL,
  content         TEXT        NOT NULL,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  original_created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS cold_tier_agent_id_idx    ON cold_tier (agent_id);
CREATE INDEX IF NOT EXISTS cold_tier_source_idx      ON cold_tier (source_table, source_id);
CREATE INDEX IF NOT EXISTS cold_tier_archived_at_idx ON cold_tier (archived_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- consolidation_log — audit trail for consolidation runs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consolidation_log (
  id                  BIGSERIAL   PRIMARY KEY,
  agent_id            TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  hot_rows_processed  INT         NOT NULL DEFAULT 0,
  warm_rows_created   INT         NOT NULL DEFAULT 0,
  status              TEXT        NOT NULL DEFAULT 'running'
                                    CHECK (status IN ('running', 'complete', 'failed')),
  error               TEXT,
  metadata            JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS consolidation_log_agent_id_idx ON consolidation_log (agent_id);
CREATE INDEX IF NOT EXISTS consolidation_log_started_idx  ON consolidation_log (started_at DESC);
