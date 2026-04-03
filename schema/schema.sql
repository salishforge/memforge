-- MemForge Standalone — PostgreSQL Schema
-- Five-table design: hot_tier, warm_tier, cold_tier, consolidation_log, agents

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

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
-- warm_tier — consolidated, full-text-searchable memory with embeddings
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warm_tier (
  id                  BIGSERIAL   PRIMARY KEY,
  agent_id            TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content             TEXT        NOT NULL,
  content_tsv         TSVECTOR    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  embedding           vector,     -- pgvector column, dimensions set by provider
  source_hot_ids      BIGINT[]    NOT NULL DEFAULT '{}',
  metadata            JSONB       NOT NULL DEFAULT '{}',
  consolidated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Temporal bounds of the source events in this consolidated row
  time_start          TIMESTAMPTZ,
  time_end            TIMESTAMPTZ,
  -- Access tracking for temporal decay and reinforcement
  access_count        INT         NOT NULL DEFAULT 0,
  last_accessed       TIMESTAMPTZ,
  -- Composite scoring for importance-based ranking and eviction
  importance          REAL        NOT NULL DEFAULT 0.5,
  confidence          REAL        NOT NULL DEFAULT 0.5,
  revision_count      INT         NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS warm_tier_agent_id_idx ON warm_tier (agent_id);
CREATE INDEX IF NOT EXISTS warm_tier_tsv_idx      ON warm_tier USING GIN (content_tsv);
CREATE INDEX IF NOT EXISTS warm_tier_hot_ids_idx  ON warm_tier USING GIN (source_hot_ids);
CREATE INDEX IF NOT EXISTS warm_tier_embedding_idx ON warm_tier USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS warm_tier_time_idx       ON warm_tier (agent_id, time_start, time_end);
CREATE INDEX IF NOT EXISTS warm_tier_importance_idx ON warm_tier (agent_id, importance DESC);

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

-- ─────────────────────────────────────────────────────────────────────────────
-- entities — knowledge graph nodes extracted during consolidation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entities (
  id              BIGSERIAL   PRIMARY KEY,
  agent_id        TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  entity_type     TEXT        NOT NULL DEFAULT 'other',
  metadata        JSONB       NOT NULL DEFAULT '{}',
  first_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
  mention_count   INT         NOT NULL DEFAULT 1,
  UNIQUE (agent_id, name)
);

CREATE INDEX IF NOT EXISTS entities_agent_id_idx  ON entities (agent_id);
CREATE INDEX IF NOT EXISTS entities_name_idx      ON entities (agent_id, name);
CREATE INDEX IF NOT EXISTS entities_type_idx      ON entities (agent_id, entity_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- relationships — knowledge graph edges between entities
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relationships (
  id                BIGSERIAL   PRIMARY KEY,
  agent_id          TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  source_entity_id  BIGINT      NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id  BIGINT      NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type     TEXT        NOT NULL,
  weight            REAL        NOT NULL DEFAULT 1.0,
  metadata          JSONB       NOT NULL DEFAULT '{}',
  first_seen        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen         TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from        TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until       TIMESTAMPTZ,  -- NULL = still valid
  UNIQUE (agent_id, source_entity_id, target_entity_id, relation_type)
);

CREATE INDEX IF NOT EXISTS relationships_agent_id_idx ON relationships (agent_id);
CREATE INDEX IF NOT EXISTS relationships_source_idx   ON relationships (source_entity_id);
CREATE INDEX IF NOT EXISTS relationships_target_idx   ON relationships (target_entity_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- warm_tier_entities — junction linking warm rows to entities they mention
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warm_tier_entities (
  warm_tier_id    BIGINT  NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  entity_id       BIGINT  NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (warm_tier_id, entity_id)
);

CREATE INDEX IF NOT EXISTS warm_tier_entities_entity_idx ON warm_tier_entities (entity_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- reflections — synthesized insights from periodic LLM review
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- retrieval_log — records every query hit for reinforcement analysis
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- memory_revisions — tracks every rewrite of a warm-tier memory
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- procedures — learned condition→action rules (procedural memory)
-- ─────────────────────────────────────────────────────────────────────────────
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
