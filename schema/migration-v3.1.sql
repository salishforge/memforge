-- MemForge — Migration v3.1: Memory Namespaces
-- Adds `namespace` to the 8 memory tables (hot, warm, cold, reflections,
-- procedures, consolidation_log, retrieval_log, memory_revisions).
--
-- Entities and relationships are intentionally NOT namespaced — they are
-- agent-scoped. A single entity (e.g. "User Sarah") can appear across many
-- namespace contexts for the same agent; duplicating it per namespace would
-- fragment the knowledge graph and break cross-namespace entity reuse.
-- The warm_tier_entities junction stays unchanged: a warm row (which IS
-- namespaced) already carries the namespace; the linked entities do not need it.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS (PG 17+) inside DO blocks for
-- older Postgres, CREATE INDEX IF NOT EXISTS for indexes.
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v3.1.sql

-- ─── hot_tier ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE hot_tier ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS hot_tier_namespace_idx ON hot_tier (agent_id, namespace);

-- ─── warm_tier ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE warm_tier ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS warm_tier_namespace_idx ON warm_tier (agent_id, namespace);

-- ─── cold_tier ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE cold_tier ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS cold_tier_namespace_idx ON cold_tier (agent_id, namespace);

-- ─── reflections ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE reflections ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS reflections_namespace_idx ON reflections (agent_id, namespace);

-- ─── procedures ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE procedures ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS procedures_namespace_idx ON procedures (agent_id, namespace);

-- ─── consolidation_log ───────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE consolidation_log ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS consolidation_log_namespace_idx ON consolidation_log (agent_id, namespace);

-- ─── retrieval_log ───────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE retrieval_log ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS retrieval_log_namespace_idx ON retrieval_log (agent_id, namespace);

-- ─── memory_revisions ────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE memory_revisions ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS memory_revisions_namespace_idx ON memory_revisions (agent_id, namespace);
