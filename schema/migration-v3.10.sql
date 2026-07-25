-- MemForge — Migration v3.10: Causal Memory Graph + Hierarchical Abstraction
--
-- Features 3 and 4 of the Phase 5 Autonomous Knowledge Architecture split
-- (features 1, 5, 6 landed in v3.8/v3.9):
--   F3: Causal Memory Graph (causal_edges table) — inferred cause→effect
--       chains mined from temporal sequences by Sleep Phase 6.1
--   F4: Hierarchical Abstraction Engine (abstractions table) — cross-cutting
--       principles extracted from meta-reflections by Sleep Phase 5.11
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v3.10.sql

BEGIN;

-- ─── Feature 3: Causal Memory Graph ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS causal_edges (
  id                BIGSERIAL   PRIMARY KEY,
  agent_id          TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  cause_id          BIGINT      NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  effect_id         BIGINT      NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  strength          REAL        NOT NULL DEFAULT 0.0,
  observation_count INTEGER     NOT NULL DEFAULT 1,
  avg_lag_seconds   REAL,
  confidence        REAL        NOT NULL DEFAULT 0.5,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, cause_id, effect_id)
);

CREATE INDEX IF NOT EXISTS causal_edges_agent_cause_idx
  ON causal_edges (agent_id, cause_id);
CREATE INDEX IF NOT EXISTS causal_edges_agent_effect_idx
  ON causal_edges (agent_id, effect_id);

-- ─── Feature 4: Hierarchical Abstraction Engine ─────────────────────────────

CREATE TABLE IF NOT EXISTS abstractions (
  id                    BIGSERIAL   PRIMARY KEY,
  agent_id              TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  level                 TEXT        NOT NULL,
  content               TEXT        NOT NULL,
  source_reflection_ids BIGINT[]    NOT NULL DEFAULT '{}',
  confidence            REAL        NOT NULL DEFAULT 0.5,
  active                BOOLEAN     NOT NULL DEFAULT true,
  namespace             TEXT        NOT NULL DEFAULT 'default',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS abstractions_agent_level_idx
  ON abstractions (agent_id, level, active);

-- ─── RLS on new tables ──────────────────────────────────────────────────────

ALTER TABLE causal_edges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS causal_edges_agent_isolation ON causal_edges;
CREATE POLICY causal_edges_agent_isolation ON causal_edges
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE abstractions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS abstractions_agent_isolation ON abstractions;
CREATE POLICY abstractions_agent_isolation ON abstractions
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- ─── Grants for memforge_app role (if exists) ───────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memforge_app') THEN
    EXECUTE 'GRANT ALL ON causal_edges TO memforge_app';
    EXECUTE 'GRANT ALL ON abstractions TO memforge_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE causal_edges_id_seq TO memforge_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE abstractions_id_seq TO memforge_app';
  END IF;
END $$;

COMMIT;
