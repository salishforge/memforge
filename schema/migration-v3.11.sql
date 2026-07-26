-- MemForge — Migration v3.11: Hierarchical Abstraction Engine
--
-- Feature 4 of the Phase 5 Autonomous Knowledge Architecture split
-- (features 1, 5, 6 landed in v3.8/v3.9; features 2, 3 in v3.10).
--
-- abstractions stores cross-cutting knowledge distilled from meta-reflections.
-- Sleep Phase 5.11 (phasePrincipleExtraction) prompts the LLM with the 10 most
-- recent meta-reflections (reflection_level > 1, minimum 3 required) and
-- inserts the extracted principles at level 'principle'. Read paths:
-- getAbstractions() and getPrinciples() (active rows only, ordered by
-- confidence then recency).
--
-- content_hash exists for dedup: principles are re-extracted every sleep
-- cycle, and identical content must upsert-noop rather than accumulate
-- duplicate rows. It is a stored generated md5(content), and
-- UNIQUE (agent_id, level, namespace, content_hash) is the conflict target
-- for the phase's ON CONFLICT ... DO NOTHING insert.
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v3.11.sql

BEGIN;

-- ─── Feature 4: Hierarchical Abstraction Engine ─────────────────────────────

CREATE TABLE IF NOT EXISTS abstractions (
  id                    BIGSERIAL   PRIMARY KEY,
  agent_id              TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  level                 TEXT        NOT NULL CHECK (level IN ('principle', 'strategy', 'mental_model')),
  content               TEXT        NOT NULL,
  content_hash          TEXT        GENERATED ALWAYS AS (md5(content)) STORED,
  source_reflection_ids BIGINT[]    NOT NULL DEFAULT '{}',
  confidence            REAL        NOT NULL DEFAULT 0.5,
  active                BOOLEAN     NOT NULL DEFAULT true,
  namespace             TEXT        NOT NULL DEFAULT 'default',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, level, namespace, content_hash)
);

CREATE INDEX IF NOT EXISTS abstractions_agent_level_idx
  ON abstractions (agent_id, level, active);

-- ─── RLS on new table ───────────────────────────────────────────────────────

ALTER TABLE abstractions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS abstractions_agent_isolation ON abstractions;
CREATE POLICY abstractions_agent_isolation ON abstractions
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- ─── Grants for memforge_app role (if exists) ───────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memforge_app') THEN
    EXECUTE 'GRANT ALL ON abstractions TO memforge_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE abstractions_id_seq TO memforge_app';
  END IF;
END $$;

COMMIT;
