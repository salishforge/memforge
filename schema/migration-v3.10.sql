-- MemForge — Migration v3.10: Causal Memory Graph
--
-- Feature 3 of the Phase 5 Autonomous Knowledge Architecture split
-- (features 1, 5, 6 landed in v3.8/v3.9).
--
-- causal_edges stores inferred cause→effect links between warm-tier memories.
-- Sleep Phase 6.1 (phaseCausalInference) mines memory_sequences for A→B pairs
-- observed >= 3 times, scoring strength by occurrence count weighted by the
-- temporal consistency of the gap (inverse coefficient of variation), and
-- prunes edges whose strength falls below 0.1. Read paths: getCausalChain()
-- (recursive CTE traversal in either direction) and predict() (context →
-- probable next events ranked by edge strength and confidence).
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

-- ─── RLS on new table ───────────────────────────────────────────────────────

ALTER TABLE causal_edges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS causal_edges_agent_isolation ON causal_edges;
CREATE POLICY causal_edges_agent_isolation ON causal_edges
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- ─── Grants for memforge_app role (if exists) ───────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memforge_app') THEN
    EXECUTE 'GRANT ALL ON causal_edges TO memforge_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE causal_edges_id_seq TO memforge_app';
  END IF;
END $$;

COMMIT;
