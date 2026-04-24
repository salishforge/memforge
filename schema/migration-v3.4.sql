-- MemForge migration v3.4 — Phase 4 final: Selective Forgetting
-- Adds: deprecated_namespaces table for operator-driven domain deprecation.
--
-- Sleep cycle Phase 5.10 decays importance/confidence of warm_tier rows
-- whose namespace is in this table for the agent. Combined with the
-- existing Phase 2 eviction at importance < threshold, deprecated
-- knowledge fades from the warm tier within a handful of cycles.
--
-- Run: psql "$DATABASE_URL" -f schema/migration-v3.4.sql

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'deprecated_namespaces'
  ) THEN
    CREATE TABLE deprecated_namespaces (
      agent_id      TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      namespace     TEXT        NOT NULL,
      deprecated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reason        TEXT,
      PRIMARY KEY (agent_id, namespace)
    );
    CREATE INDEX deprecated_namespaces_agent_idx ON deprecated_namespaces (agent_id);
  END IF;
END $$;
