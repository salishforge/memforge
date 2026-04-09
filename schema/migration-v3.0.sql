-- MemForge Migration v3.0 — Cross-Agent Shared Memory (Phase 3)
--
-- 1. Shared memory pools (team and global)
-- 2. Agent pool memberships
-- 3. Shared memories with provenance chains
-- 4. Agent reputation (per domain)
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v3.0.sql

-- ─── Shared memory pools ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shared_pools (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  pool_type   TEXT NOT NULL DEFAULT 'team' CHECK (pool_type IN ('team', 'global')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata    JSONB NOT NULL DEFAULT '{}'
);

-- ─── Agent pool memberships ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pool_memberships (
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  pool_id     TEXT NOT NULL REFERENCES shared_pools(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, pool_id)
);
CREATE INDEX IF NOT EXISTS pool_memberships_pool_idx ON pool_memberships (pool_id);

-- ─── Shared memories with provenance ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shared_memories (
  id                  BIGSERIAL PRIMARY KEY,
  pool_id             TEXT NOT NULL REFERENCES shared_pools(id) ON DELETE CASCADE,
  source_agent_id     TEXT NOT NULL REFERENCES agents(id),
  source_warm_tier_id BIGINT REFERENCES warm_tier(id) ON DELETE SET NULL,
  content             TEXT NOT NULL,
  content_tsv         TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  summary             TEXT,
  embedding           halfvec,
  metadata            JSONB NOT NULL DEFAULT '{}',
  source_chain        TEXT[] NOT NULL DEFAULT '{}',
  hop_count           INT NOT NULL DEFAULT 1,
  base_confidence     REAL NOT NULL DEFAULT 0.5,
  importance          REAL NOT NULL DEFAULT 0.5,
  corroboration_count INT NOT NULL DEFAULT 0,
  published_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_memories_pool_idx ON shared_memories (pool_id);
CREATE INDEX IF NOT EXISTS shared_memories_source_idx ON shared_memories (source_agent_id);
CREATE INDEX IF NOT EXISTS shared_memories_tsv_idx ON shared_memories USING GIN (content_tsv);
CREATE INDEX IF NOT EXISTS shared_memories_embedding_idx ON shared_memories USING hnsw (embedding halfvec_cosine_ops);

-- ─── Agent reputation (per domain) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_reputation (
  agent_id             TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  domain               TEXT NOT NULL DEFAULT '_global',
  score                REAL NOT NULL DEFAULT 0.7,
  corroboration_count  INT NOT NULL DEFAULT 0,
  contradiction_count  INT NOT NULL DEFAULT 0,
  contribution_count   INT NOT NULL DEFAULT 0,
  last_updated         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, domain)
);
