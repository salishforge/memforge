-- MemForge — PostgreSQL Canonical Schema
-- Single-file fresh-install schema incorporating all migrations through v3.1.
-- To install: psql "$DATABASE_URL" -f schema/schema.sql
-- As of v3.1.0, namespace column added to memory tables (hot/warm/cold/reflections/
-- procedures/consolidation_log/retrieval_log/memory_revisions). Entities and
-- relationships remain agent-scoped only — see migration-v3.1.sql for rationale.
-- As of v3.0.0-beta.3, RLS policies and the audit delete trigger are included
-- here by default. Fresh installs are secure-by-default. Existing v2.2 deploys
-- must still run migration-v2.3.sql (which remains functional for that purpose).

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────────────────────────────────────
-- agents — registry of all known agents (multi-tenant anchor)
-- Added in v2.4: last_sleep_cycle, sleep_cycle_cost_tokens, scoring_weights
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id                      TEXT        PRIMARY KEY,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen               TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata                JSONB       NOT NULL DEFAULT '{}',
  last_sleep_cycle        TIMESTAMPTZ,
  sleep_cycle_cost_tokens BIGINT      NOT NULL DEFAULT 0,
  scoring_weights         JSONB
);

-- ─────────────────────────────────────────────────────────────────────────────
-- hot_tier — recent raw events (write-heavy, fast ingestion)
-- Added in v2.4: content_hash
-- Added in v3.1: namespace
-- Added in v3.5: session_id (per-device isolation; default 'default')
-- Added in v3.8: context_signals (urgency/sentiment/session_type via keyword heuristics)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hot_tier (
  id              BIGSERIAL   PRIMARY KEY,
  agent_id        TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content         TEXT        NOT NULL,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash    TEXT,
  namespace       TEXT        NOT NULL DEFAULT 'default',
  session_id      TEXT        NOT NULL DEFAULT 'default',
  context_signals JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS hot_tier_agent_id_idx     ON hot_tier (agent_id);
CREATE INDEX IF NOT EXISTS hot_tier_created_at_idx   ON hot_tier (created_at DESC);
CREATE INDEX IF NOT EXISTS hot_tier_content_hash_idx ON hot_tier (agent_id, content_hash);
CREATE INDEX IF NOT EXISTS hot_tier_namespace_idx    ON hot_tier (agent_id, namespace);
CREATE INDEX IF NOT EXISTS hot_tier_session_idx      ON hot_tier (agent_id, namespace, session_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- warm_tier — consolidated, full-text-searchable memory with embeddings
-- v1.2: embedding (halfvec via v2.7), time_start, time_end, access_count, last_accessed
-- v1.6: importance, confidence, revision_count
-- v2.2: content_hash
-- v2.4: outcome_type, graduated, retrieval_success_count, first_successful_retrieval,
--        content_code_tsv, summary (v2.5)
-- v2.6: surprise_score, staleness_score, last_corroborated
-- v3.1: namespace
-- v3.8: context_signals (merged from contributing hot rows at consolidation time)
-- v3.9: epistemic_status, evidence_count, last_corroborated_at (epistemic confidence model)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warm_tier (
  id                          BIGSERIAL   PRIMARY KEY,
  agent_id                    TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content                     TEXT        NOT NULL,
  content_tsv                 TSVECTOR    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  embedding                   halfvec,
  source_hot_ids              BIGINT[]    NOT NULL DEFAULT '{}',
  metadata                    JSONB       NOT NULL DEFAULT '{}',
  consolidated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Temporal bounds of the source events in this consolidated row
  time_start                  TIMESTAMPTZ,
  time_end                    TIMESTAMPTZ,
  -- Access tracking for temporal decay and reinforcement
  access_count                INT         NOT NULL DEFAULT 0,
  last_accessed               TIMESTAMPTZ,
  -- Composite scoring for importance-based ranking and eviction
  importance                  REAL        NOT NULL DEFAULT 0.5,
  confidence                  REAL        NOT NULL DEFAULT 0.5,
  revision_count              INT         NOT NULL DEFAULT 0,
  -- Content integrity hash (HMAC-SHA256)
  content_hash                TEXT        NOT NULL DEFAULT '',
  -- Outcome tagging (#51)
  outcome_type                TEXT        NOT NULL DEFAULT 'neutral'
                                CHECK (outcome_type IN ('error', 'success', 'decision', 'observation', 'neutral')),
  -- Confidence graduation (#50)
  graduated                   BOOLEAN     NOT NULL DEFAULT false,
  retrieval_success_count     INT         NOT NULL DEFAULT 0,
  first_successful_retrieval  TIMESTAMPTZ,
  -- Code-preserving FTS (simple dictionary preserves identifiers/symbols) (#55)
  content_code_tsv            TSVECTOR    GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  -- Hierarchical summary populated during LLM-mode consolidation, NULL in concat mode
  summary                     TEXT,
  -- Active knowledge management (#79, #78)
  surprise_score              REAL        NOT NULL DEFAULT 0,
  staleness_score             REAL        NOT NULL DEFAULT 0,
  last_corroborated           TIMESTAMPTZ,
  -- Namespace partitioning (#16) — defaults to 'default' so existing callers are unaffected
  namespace                   TEXT        NOT NULL DEFAULT 'default',
  -- Temporal validity window (v3.3) — NULL = no expiry
  valid_until                 TIMESTAMPTZ,
  -- Tracks which embedding model produced the embedding (v3.3) — NULL = unknown/pre-tracking
  embedding_model             TEXT,
  -- Originating hot-tier session for provenance (v3.5) — NULL = consolidated before
  -- per-session tracking, distinct from the literal 'default' session.
  session_id                  TEXT,
  -- Sentiment tagging (v3.8) — merged from contributing hot rows: urgency=max, others=majority
  context_signals             JSONB       NOT NULL DEFAULT '{}',
  -- Epistemic confidence model (v3.9) — calibrated uncertainty level for this memory
  epistemic_status            TEXT        NOT NULL DEFAULT 'provisional',
  -- Number of positive retrieval events corroborating this memory
  evidence_count              INTEGER     NOT NULL DEFAULT 1,
  -- Timestamp of the most recent promotion to 'established' by Phase 5.12
  last_corroborated_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS warm_tier_agent_id_idx      ON warm_tier (agent_id);
CREATE INDEX IF NOT EXISTS warm_tier_valid_until_idx   ON warm_tier (agent_id, valid_until) WHERE valid_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS warm_tier_tsv_idx        ON warm_tier USING GIN (content_tsv);
CREATE INDEX IF NOT EXISTS warm_tier_code_tsv_idx   ON warm_tier USING GIN (content_code_tsv);
CREATE INDEX IF NOT EXISTS warm_tier_hot_ids_idx    ON warm_tier USING GIN (source_hot_ids);
-- HNSW index on warm_tier.embedding intentionally omitted here (#95): pgvector
-- requires halfvec columns to have an explicit dimension spec before an HNSW
-- index can be built, and the dimension is provider-specific (384 for
-- bge-small-en-v1.5, 1536 for text-embedding-3-small, 768 for nomic-embed,
-- etc.). After deploying, operators who use embeddings should apply
-- schema/hnsw-indexes.example.sql (edit to match their provider's dimension).
-- Without the HNSW index, semantic search falls back to seq scan — functional
-- but slower for large warm tiers.
CREATE INDEX IF NOT EXISTS warm_tier_time_idx       ON warm_tier (agent_id, time_start, time_end);
CREATE INDEX IF NOT EXISTS warm_tier_importance_idx ON warm_tier (agent_id, importance DESC);
CREATE INDEX IF NOT EXISTS warm_tier_namespace_idx  ON warm_tier (agent_id, namespace);
CREATE INDEX IF NOT EXISTS warm_tier_session_idx    ON warm_tier (agent_id, namespace, session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS warm_tier_epistemic_idx  ON warm_tier (agent_id, epistemic_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- cold_tier — archived / cleared memory (audit trail, never hard-deleted)
-- Added in v3.1: namespace
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cold_tier (
  id                  BIGSERIAL   PRIMARY KEY,
  agent_id            TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  source_table        TEXT        NOT NULL CHECK (source_table IN ('hot_tier', 'warm_tier')),
  source_id           BIGINT      NOT NULL,
  content             TEXT        NOT NULL,
  metadata            JSONB       NOT NULL DEFAULT '{}',
  archived_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  original_created_at TIMESTAMPTZ NOT NULL,
  namespace           TEXT        NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS cold_tier_agent_id_idx    ON cold_tier (agent_id);
CREATE INDEX IF NOT EXISTS cold_tier_source_idx      ON cold_tier (source_table, source_id);
CREATE INDEX IF NOT EXISTS cold_tier_archived_at_idx ON cold_tier (archived_at DESC);
CREATE INDEX IF NOT EXISTS cold_tier_namespace_idx   ON cold_tier (agent_id, namespace);

-- ─────────────────────────────────────────────────────────────────────────────
-- consolidation_log — audit trail for consolidation runs
-- Added in v3.1: namespace
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
  metadata            JSONB       NOT NULL DEFAULT '{}',
  namespace           TEXT        NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS consolidation_log_agent_id_idx  ON consolidation_log (agent_id);
CREATE INDEX IF NOT EXISTS consolidation_log_started_idx   ON consolidation_log (started_at DESC);
CREATE INDEX IF NOT EXISTS consolidation_log_namespace_idx ON consolidation_log (agent_id, namespace);

-- ─────────────────────────────────────────────────────────────────────────────
-- entities — knowledge graph nodes extracted during consolidation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entities (
  id            BIGSERIAL   PRIMARY KEY,
  agent_id      TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  entity_type   TEXT        NOT NULL DEFAULT 'other',
  metadata      JSONB       NOT NULL DEFAULT '{}',
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
  mention_count INT         NOT NULL DEFAULT 1,
  UNIQUE (agent_id, name)
);

CREATE INDEX IF NOT EXISTS entities_agent_id_idx ON entities (agent_id);
CREATE INDEX IF NOT EXISTS entities_name_idx     ON entities (agent_id, name);
CREATE INDEX IF NOT EXISTS entities_type_idx     ON entities (agent_id, entity_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- relationships — knowledge graph edges between entities
-- Added in v2.0: valid_from, valid_until (temporal edge annotations)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relationships (
  id               BIGSERIAL   PRIMARY KEY,
  agent_id         TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  source_entity_id BIGINT      NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id BIGINT      NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type    TEXT        NOT NULL,
  weight           REAL        NOT NULL DEFAULT 1.0,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  first_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen        TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until      TIMESTAMPTZ,  -- NULL = still valid
  UNIQUE (agent_id, source_entity_id, target_entity_id, relation_type)
);

CREATE INDEX IF NOT EXISTS relationships_agent_id_idx ON relationships (agent_id);
CREATE INDEX IF NOT EXISTS relationships_source_idx   ON relationships (source_entity_id);
CREATE INDEX IF NOT EXISTS relationships_target_idx   ON relationships (target_entity_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- warm_tier_entities — junction linking warm rows to entities they mention
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warm_tier_entities (
  warm_tier_id BIGINT NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  entity_id    BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (warm_tier_id, entity_id)
);

CREATE INDEX IF NOT EXISTS warm_tier_entities_entity_idx ON warm_tier_entities (entity_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- reflections — synthesized insights from periodic LLM review
-- Added in v2.1: reflection_level, source_reflection_ids (meta-reflection)
-- Added in v3.1: namespace
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reflections (
  id                    BIGSERIAL   PRIMARY KEY,
  agent_id              TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content               TEXT        NOT NULL,
  key_insights          TEXT[]      NOT NULL DEFAULT '{}',
  contradictions        TEXT[]      NOT NULL DEFAULT '{}',
  source_warm_ids       BIGINT[]    NOT NULL DEFAULT '{}',
  trigger_type          TEXT        NOT NULL DEFAULT 'manual'
                                      CHECK (trigger_type IN ('manual', 'threshold', 'scheduled')),
  metadata              JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Meta-reflection hierarchy (#v2.1)
  reflection_level      INT         NOT NULL DEFAULT 1,
  source_reflection_ids BIGINT[]    NOT NULL DEFAULT '{}',
  -- Namespace partitioning (#16)
  namespace             TEXT        NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS reflections_agent_id_idx  ON reflections (agent_id);
CREATE INDEX IF NOT EXISTS reflections_created_idx   ON reflections (created_at DESC);
CREATE INDEX IF NOT EXISTS reflections_level_idx     ON reflections (agent_id, reflection_level);
CREATE INDEX IF NOT EXISTS reflections_namespace_idx ON reflections (agent_id, namespace);

-- ─────────────────────────────────────────────────────────────────────────────
-- retrieval_log — records every query hit for reinforcement analysis
-- Added in v2.1: outcome, feedback_at, feedback_metadata
-- Added in v3.1: namespace
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retrieval_log (
  id                BIGSERIAL   PRIMARY KEY,
  agent_id          TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  warm_tier_id      BIGINT      NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  query_text        TEXT        NOT NULL,
  query_mode        TEXT        NOT NULL DEFAULT 'keyword',
  rank_position     INT         NOT NULL DEFAULT 0,
  metadata          JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Downstream outcome feedback (#v2.1)
  outcome           TEXT        CHECK (outcome IN ('positive', 'negative', 'neutral')),
  feedback_at       TIMESTAMPTZ,
  feedback_metadata JSONB       NOT NULL DEFAULT '{}',
  -- Namespace partitioning (#16)
  namespace         TEXT        NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS retrieval_log_agent_idx     ON retrieval_log (agent_id);
CREATE INDEX IF NOT EXISTS retrieval_log_warm_idx      ON retrieval_log (warm_tier_id);
CREATE INDEX IF NOT EXISTS retrieval_log_created_idx   ON retrieval_log (created_at DESC);
CREATE INDEX IF NOT EXISTS retrieval_log_outcome_idx   ON retrieval_log (agent_id, outcome) WHERE outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS retrieval_log_namespace_idx ON retrieval_log (agent_id, namespace);

-- ─────────────────────────────────────────────────────────────────────────────
-- memory_revisions — tracks every rewrite of a warm-tier memory
-- Added in v3.1: namespace
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
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Namespace partitioning (#16)
  namespace        TEXT        NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS memory_revisions_agent_idx     ON memory_revisions (agent_id);
CREATE INDEX IF NOT EXISTS memory_revisions_warm_idx      ON memory_revisions (warm_tier_id);
CREATE INDEX IF NOT EXISTS memory_revisions_namespace_idx ON memory_revisions (agent_id, namespace);

-- ─────────────────────────────────────────────────────────────────────────────
-- procedures — learned condition→action rules (procedural memory)
-- Added in v3.1: namespace
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procedures (
  id                   BIGSERIAL   PRIMARY KEY,
  agent_id             TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  condition            TEXT        NOT NULL,
  action               TEXT        NOT NULL,
  source_reflection_id BIGINT      REFERENCES reflections(id) ON DELETE SET NULL,
  confidence           REAL        NOT NULL DEFAULT 0.5,
  access_count         INT         NOT NULL DEFAULT 0,
  last_accessed        TIMESTAMPTZ,
  active               BOOLEAN     NOT NULL DEFAULT true,
  metadata             JSONB       NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Namespace partitioning (#16)
  namespace            TEXT        NOT NULL DEFAULT 'default',
  -- Outcome tracking (v3.3) — counts positive/negative recordings
  success_count        INT         NOT NULL DEFAULT 0,
  failure_count        INT         NOT NULL DEFAULT 0,
  last_outcome         TEXT        CHECK (last_outcome IN ('positive', 'negative', 'neutral')),
  last_outcome_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS procedures_agent_idx      ON procedures (agent_id);
CREATE INDEX IF NOT EXISTS procedures_active_idx     ON procedures (agent_id, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS procedures_namespace_idx  ON procedures (agent_id, namespace);

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_chain — immutable hash-chained audit log of all warm-tier mutations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_chain (
  id             BIGSERIAL   PRIMARY KEY,
  agent_id       TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  -- What was changed
  target_table   TEXT        NOT NULL CHECK (target_table IN ('warm_tier', 'entities', 'relationships', 'reflections', 'procedures')),
  target_id      BIGINT      NOT NULL,

  -- Temporal: when this version was valid
  operation      TEXT        NOT NULL CHECK (operation IN ('create', 'update', 'delete', 'revise', 'merge', 'evict', 'score', 'feedback')),
  valid_from     TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until    TIMESTAMPTZ,  -- NULL = current version

  -- Content snapshot
  content_before TEXT,         -- NULL on create
  content_after  TEXT,         -- NULL on delete
  metadata_delta JSONB       NOT NULL DEFAULT '{}',  -- what changed in metadata/scores

  -- Integrity chain
  content_hash   TEXT        NOT NULL,  -- HMAC-SHA256 of content_after (or content_before for deletes)
  previous_hash  TEXT        NOT NULL DEFAULT '',  -- hash of previous audit_chain record for this target
  chain_hash     TEXT        NOT NULL,  -- HMAC-SHA256(previous_hash + content_hash + operation + valid_from)

  -- Context
  triggered_by   TEXT        NOT NULL DEFAULT 'api',  -- 'api', 'sleep_cycle', 'consolidation', 'reflection', 'dedup', 'feedback'
  model_used     TEXT,        -- LLM model if this was an AI-driven change

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_chain_agent_idx   ON audit_chain (agent_id);
CREATE INDEX IF NOT EXISTS audit_chain_target_idx  ON audit_chain (target_table, target_id);
CREATE INDEX IF NOT EXISTS audit_chain_created_idx ON audit_chain (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_chain_valid_idx   ON audit_chain (valid_from, valid_until);

-- ─────────────────────────────────────────────────────────────────────────────
-- cold_audit — archived audit records past retention window
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cold_audit (
  id                  BIGSERIAL   PRIMARY KEY,
  agent_id            TEXT        NOT NULL,
  target_table        TEXT        NOT NULL,
  target_id           BIGINT      NOT NULL,
  operation           TEXT        NOT NULL,
  valid_from          TIMESTAMPTZ NOT NULL,
  valid_until         TIMESTAMPTZ,
  content_hash        TEXT        NOT NULL,
  chain_hash          TEXT        NOT NULL,
  triggered_by        TEXT        NOT NULL,
  archived_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  original_created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS cold_audit_agent_idx  ON cold_audit (agent_id);
CREATE INDEX IF NOT EXISTS cold_audit_target_idx ON cold_audit (target_table, target_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- memory_conflicts — conflicting warm-tier memory pairs (#80)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_conflicts (
  id                  BIGSERIAL   PRIMARY KEY,
  agent_id            TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  warm_tier_id_a      BIGINT      NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  warm_tier_id_b      BIGINT      NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  contradiction_type  TEXT        NOT NULL DEFAULT 'factual',
  severity            REAL        NOT NULL DEFAULT 0.5,
  resolved            BOOLEAN     NOT NULL DEFAULT false,
  winner_id           BIGINT      REFERENCES warm_tier(id),
  resolution_strategy TEXT,
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS memory_conflicts_agent_idx ON memory_conflicts (agent_id, resolved);

-- ─────────────────────────────────────────────────────────────────────────────
-- memory_sequences — temporal event chains linking warm-tier rows (#76)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_sequences (
  id             BIGSERIAL   PRIMARY KEY,
  agent_id       TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  predecessor_id BIGINT      NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  successor_id   BIGINT      NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  gap_seconds    REAL,
  UNIQUE (agent_id, predecessor_id, successor_id)
);

CREATE INDEX IF NOT EXISTS memory_sequences_pred_idx ON memory_sequences (predecessor_id);
CREATE INDEX IF NOT EXISTS memory_sequences_succ_idx ON memory_sequences (successor_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- knowledge_gaps — unanswered queries that expose knowledge holes (#77)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id          BIGSERIAL   PRIMARY KEY,
  agent_id    TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  query_text  TEXT        NOT NULL,
  gap_type    TEXT        NOT NULL DEFAULT 'no_results',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved    BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS knowledge_gaps_agent_idx ON knowledge_gaps (agent_id, resolved);

-- ─────────────────────────────────────────────────────────────────────────────
-- shared_pools — cross-agent shared memory pools (team or global)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_pools (
  id          TEXT        PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT,
  pool_type   TEXT        NOT NULL DEFAULT 'team' CHECK (pool_type IN ('team', 'global')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata    JSONB       NOT NULL DEFAULT '{}'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- pool_memberships — agent membership in shared pools
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pool_memberships (
  agent_id  TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  pool_id   TEXT        NOT NULL REFERENCES shared_pools(id) ON DELETE CASCADE,
  role      TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, pool_id)
);

CREATE INDEX IF NOT EXISTS pool_memberships_pool_idx ON pool_memberships (pool_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- shared_memories — memories published to a pool with provenance chains
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_memories (
  id                  BIGSERIAL   PRIMARY KEY,
  pool_id             TEXT        NOT NULL REFERENCES shared_pools(id) ON DELETE CASCADE,
  source_agent_id     TEXT        NOT NULL REFERENCES agents(id),
  source_warm_tier_id BIGINT      REFERENCES warm_tier(id) ON DELETE SET NULL,
  content             TEXT        NOT NULL,
  content_tsv         TSVECTOR    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  summary             TEXT,
  embedding           halfvec,
  metadata            JSONB       NOT NULL DEFAULT '{}',
  source_chain        TEXT[]      NOT NULL DEFAULT '{}',
  hop_count           INT         NOT NULL DEFAULT 1,
  base_confidence     REAL        NOT NULL DEFAULT 0.5,
  importance          REAL        NOT NULL DEFAULT 0.5,
  corroboration_count INT         NOT NULL DEFAULT 0,
  published_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_memories_pool_idx      ON shared_memories (pool_id);
CREATE INDEX IF NOT EXISTS shared_memories_source_idx    ON shared_memories (source_agent_id);
CREATE INDEX IF NOT EXISTS shared_memories_tsv_idx       ON shared_memories USING GIN (content_tsv);
-- HNSW index on shared_memories.embedding intentionally omitted here (#95);
-- see warm_tier above for the same reasoning. Apply via
-- schema/hnsw-indexes.example.sql after choosing a dimension.

-- ─────────────────────────────────────────────────────────────────────────────
-- agent_reputation — per-domain reputation scores for cross-agent trust
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_reputation (
  agent_id            TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  domain              TEXT        NOT NULL DEFAULT '_global',
  score               REAL        NOT NULL DEFAULT 0.7,
  corroboration_count INT         NOT NULL DEFAULT 0,
  contradiction_count INT         NOT NULL DEFAULT 0,
  contribution_count  INT         NOT NULL DEFAULT 0,
  last_updated        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, domain)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- shared_procedures — condition→action rules published to shared pools
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_procedures (
  id                  BIGSERIAL   PRIMARY KEY,
  pool_id             TEXT        NOT NULL REFERENCES shared_pools(id) ON DELETE CASCADE,
  source_agent_id     TEXT        NOT NULL REFERENCES agents(id),
  condition           TEXT        NOT NULL,
  action              TEXT        NOT NULL,
  confidence          REAL        NOT NULL DEFAULT 0.5,
  hop_count           INT         NOT NULL DEFAULT 1,
  corroboration_count INT         NOT NULL DEFAULT 0,
  active              BOOLEAN     NOT NULL DEFAULT true,
  metadata            JSONB       NOT NULL DEFAULT '{}',
  published_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_procedures_pool_idx   ON shared_procedures (pool_id);
CREATE INDEX IF NOT EXISTS shared_procedures_agent_idx  ON shared_procedures (source_agent_id);
CREATE INDEX IF NOT EXISTS shared_procedures_active_idx ON shared_procedures (pool_id, active) WHERE active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- agent_roles — declared or auto-detected expertise domains per agent
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_roles (
  agent_id        TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  domain          TEXT        NOT NULL CHECK (char_length(domain) BETWEEN 1 AND 128),
  confidence      REAL        NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  description     TEXT,
  auto_detected   BOOLEAN     NOT NULL DEFAULT false,
  evidence_count  INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, domain)
);

CREATE INDEX IF NOT EXISTS agent_roles_agent_idx ON agent_roles (agent_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- drift_signals — per-agent drift snapshots captured during each sleep cycle
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drift_signals (
  id                  BIGSERIAL   PRIMARY KEY,
  agent_id            TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  measured_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  contradiction_rate  REAL        NOT NULL DEFAULT 0,
  staleness_p90       REAL        NOT NULL DEFAULT 0,
  revision_velocity   REAL        NOT NULL DEFAULT 0,
  stale_cluster_count INT         NOT NULL DEFAULT 0,
  expired_count       INT         NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS drift_signals_agent_idx ON drift_signals (agent_id, measured_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- deprecated_namespaces — operator-driven domain deprecation (v3.4)
-- Sleep cycle Phase 5.10 decays importance/confidence of warm_tier rows
-- whose namespace is in this table. Combined with Phase 2 eviction at
-- importance < threshold, deprecated knowledge fades within a few cycles.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deprecated_namespaces (
  agent_id      TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  namespace     TEXT        NOT NULL,
  deprecated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason        TEXT,
  PRIMARY KEY (agent_id, namespace)
);
CREATE INDEX IF NOT EXISTS deprecated_namespaces_agent_idx ON deprecated_namespaces (agent_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- dream_runs (v3.6+) — async sleep-cycle runs
-- One row per dream run: persistent record with run id, immutable input
-- snapshot (warm-row id capture at run-start), status lifecycle, cancellation
-- support, and optional new-namespace output mirroring Anthropic Dreams'
-- "new memory store" semantics. The application worker in src/dream-runs.ts
-- wakes on `LISTEN dream_runs_inserted` (trigger below) and picks pending
-- rows via `FOR UPDATE SKIP LOCKED` so multi-instance deployments don't
-- double-process. Distinct from consolidation_log: that records hot→warm
-- consolidation (one row per batch), this records the full sleep cycle as
-- a long-running, possibly-external, possibly-canceled job.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dream_runs (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                 TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  namespace                TEXT        NOT NULL DEFAULT 'default',
  session_ids              TEXT[],
  model                    TEXT        NOT NULL,
  instructions             TEXT        CHECK (instructions IS NULL OR length(instructions) <= 4096),
  status                   TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','running','completed','failed','canceled')),
  source                   TEXT        NOT NULL DEFAULT 'local'
                            CHECK (source IN ('local','anthropic','bridge_pull','bridge_push')),
  output_mode              TEXT        NOT NULL DEFAULT 'in_place'
                            CHECK (output_mode IN ('in_place','new_namespace')),
  output_namespace         TEXT,
  input_warm_ids           BIGINT[],
  input_snapshot_lsn       pg_lsn,
  external_dream_id        TEXT,
  external_memory_store_id TEXT,
  external_output_store_id TEXT,
  usage_in_tokens          INTEGER     NOT NULL DEFAULT 0,
  usage_out_tokens         INTEGER     NOT NULL DEFAULT 0,
  cost_usd_micros          BIGINT      NOT NULL DEFAULT 0,
  sleep_cycle_result       JSONB,
  error                    TEXT,
  cancel_requested_at      TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at               TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  CONSTRAINT dream_runs_session_ids_cap CHECK (
    session_ids IS NULL OR array_length(session_ids, 1) <= 100
  )
);
CREATE INDEX IF NOT EXISTS dream_runs_agent_status_idx
  ON dream_runs (agent_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS dream_runs_external_idx
  ON dream_runs (external_dream_id)
  WHERE external_dream_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dream_runs_pending_idx
  ON dream_runs (status, created_at)
  WHERE status IN ('pending','running');

CREATE OR REPLACE FUNCTION dream_runs_notify_inserted()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('dream_runs_inserted', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dream_runs_notify_inserted_trg ON dream_runs;
CREATE TRIGGER dream_runs_notify_inserted_trg
  AFTER INSERT ON dream_runs
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION dream_runs_notify_inserted();

-- ─────────────────────────────────────────────────────────────────────────────
-- anthropic_memory_stores (v3.7+) — Bridge between MemForge namespaces and
-- Anthropic Memory Stores. One row per (agent_id, namespace,
-- external_store_id) linkage with mutable last_pushed_at / last_pulled_at /
-- pushed_lsn columns so /memory/:id/anthropic/sync-state can report drift
-- without re-fetching the external store.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anthropic_memory_stores (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          TEXT         NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  namespace         TEXT         NOT NULL DEFAULT 'default',
  external_store_id TEXT         NOT NULL,
  direction         TEXT         NOT NULL CHECK (direction IN ('push', 'pull', 'bidirectional')),
  warm_row_count    INTEGER      NOT NULL DEFAULT 0,
  last_pushed_at    TIMESTAMPTZ,
  last_pulled_at    TIMESTAMPTZ,
  pushed_lsn        pg_lsn,
  metadata          JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (agent_id, namespace, external_store_id)
);
CREATE INDEX IF NOT EXISTS anthropic_memory_stores_agent_ns_idx
  ON anthropic_memory_stores (agent_id, namespace);

-- ─────────────────────────────────────────────────────────────────────────────
-- sleep_phase_analytics (v3.8+) — per-phase telemetry for each sleep cycle run.
-- The sleep cycle reads the last 3 records per (agent_id, phase) to decide
-- whether to skip a phase that produced zero changes in every recent run.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sleep_phase_analytics (
  id           BIGSERIAL   PRIMARY KEY,
  agent_id     TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  phase        TEXT        NOT NULL,
  duration_ms  INTEGER     NOT NULL,
  tokens_used  INTEGER     NOT NULL DEFAULT 0,
  changes_made INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sleep_phase_analytics_agent_idx
  ON sleep_phase_analytics (agent_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security (v3.0+ fresh installs — backported from migration-v2.3)
-- FORCE ROW LEVEL SECURITY is intentionally omitted on all tables.
-- RLS applies only to non-owner roles (e.g., read-only analyst access).
-- The application role is typically the DB owner or a member of memforge_app,
-- which bypasses RLS automatically. The app does not need to set
-- app.current_agent_id in its normal execution path.
-- See DEPLOYMENT-SECURITY.md for details.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE hot_tier ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for hot_tier.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
DROP POLICY IF EXISTS hot_tier_agent_isolation ON hot_tier;
CREATE POLICY hot_tier_agent_isolation ON hot_tier
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE warm_tier ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for warm_tier.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
DROP POLICY IF EXISTS warm_tier_agent_isolation ON warm_tier;
CREATE POLICY warm_tier_agent_isolation ON warm_tier
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE cold_tier ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for cold_tier.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
DROP POLICY IF EXISTS cold_tier_agent_isolation ON cold_tier;
CREATE POLICY cold_tier_agent_isolation ON cold_tier
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE consolidation_log ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for consolidation_log.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
DROP POLICY IF EXISTS consolidation_log_agent_isolation ON consolidation_log;
CREATE POLICY consolidation_log_agent_isolation ON consolidation_log
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for entities.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
DROP POLICY IF EXISTS entities_agent_isolation ON entities;
CREATE POLICY entities_agent_isolation ON entities
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for relationships.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
DROP POLICY IF EXISTS relationships_agent_isolation ON relationships;
CREATE POLICY relationships_agent_isolation ON relationships
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for reflections.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
DROP POLICY IF EXISTS reflections_agent_isolation ON reflections;
CREATE POLICY reflections_agent_isolation ON reflections
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE retrieval_log ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for retrieval_log.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
DROP POLICY IF EXISTS retrieval_log_agent_isolation ON retrieval_log;
CREATE POLICY retrieval_log_agent_isolation ON retrieval_log
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE memory_revisions ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for memory_revisions.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
DROP POLICY IF EXISTS memory_revisions_agent_isolation ON memory_revisions;
CREATE POLICY memory_revisions_agent_isolation ON memory_revisions
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for procedures.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
DROP POLICY IF EXISTS procedures_agent_isolation ON procedures;
CREATE POLICY procedures_agent_isolation ON procedures
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE audit_chain ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for audit_chain.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
DROP POLICY IF EXISTS audit_chain_agent_isolation ON audit_chain;
CREATE POLICY audit_chain_agent_isolation ON audit_chain
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE cold_audit ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for cold_audit.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
DROP POLICY IF EXISTS cold_audit_agent_isolation ON cold_audit;
CREATE POLICY cold_audit_agent_isolation ON cold_audit
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- warm_tier_entities has no agent_id column — join through warm_tier
ALTER TABLE warm_tier_entities ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for warm_tier_entities.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
DROP POLICY IF EXISTS warm_tier_entities_agent_isolation ON warm_tier_entities;
CREATE POLICY warm_tier_entities_agent_isolation ON warm_tier_entities
  FOR ALL
  USING (warm_tier_id IN (SELECT id FROM warm_tier WHERE agent_id = current_setting('app.current_agent_id', true)))
  WITH CHECK (warm_tier_id IN (SELECT id FROM warm_tier WHERE agent_id = current_setting('app.current_agent_id', true)));

ALTER TABLE dream_runs ENABLE ROW LEVEL SECURITY;
-- FORCE intentionally omitted (see RLS section header).
DROP POLICY IF EXISTS dream_runs_agent_isolation ON dream_runs;
CREATE POLICY dream_runs_agent_isolation ON dream_runs
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE anthropic_memory_stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anthropic_memory_stores_agent_isolation ON anthropic_memory_stores;
CREATE POLICY anthropic_memory_stores_agent_isolation ON anthropic_memory_stores
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE sleep_phase_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sleep_phase_analytics_agent_isolation ON sleep_phase_analytics;
CREATE POLICY sleep_phase_analytics_agent_isolation ON sleep_phase_analytics
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- Service role that bypasses RLS
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memforge_app') THEN
    CREATE ROLE memforge_app NOLOGIN;
  END IF;
END $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO memforge_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO memforge_app;
-- Application connects as a login role that is a member of memforge_app
-- RLS protects against direct psql access with other roles

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit delete prevention (backported from migration-v2.3)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_audit_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Direct deletion from audit_chain is not allowed. Use the archiveExpired() API.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Only prevent deletes that don't come from the archive function
-- The archive function sets a session variable before deleting
DROP TRIGGER IF EXISTS audit_chain_no_delete ON audit_chain;
CREATE TRIGGER audit_chain_no_delete
  BEFORE DELETE ON audit_chain
  FOR EACH ROW
  WHEN (current_setting('memforge.archive_in_progress', true) IS DISTINCT FROM 'true')
  EXECUTE FUNCTION prevent_audit_delete();
