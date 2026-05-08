-- MemForge — Migration v3.8: Phase 5 — Autonomous Knowledge Architecture
--
-- Features:
--   1. Epistemic Confidence Model (columns on warm_tier)
--   2. Explainable Memory Operations (runtime only — no schema)
--   3. Causal Memory Graph (causal_edges table)
--   4. Hierarchical Abstraction Engine (abstractions table)
--   5. Adaptive Sleep Intelligence (sleep_phase_analytics table)
--   6. Memory Sentiment Tagging (context_signals on hot/warm_tier)
--   7. Cross-Agent Transfer Learning (uses metadata — no schema)
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v3.8.sql

BEGIN;

-- ─── Feature 1: Epistemic Confidence Model ──────────────────────────────────

ALTER TABLE warm_tier
  ADD COLUMN IF NOT EXISTS epistemic_status    TEXT    NOT NULL DEFAULT 'provisional',
  ADD COLUMN IF NOT EXISTS evidence_count      INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_corroborated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS warm_tier_epistemic_idx
  ON warm_tier (agent_id, epistemic_status);

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

-- ─── Feature 5: Adaptive Sleep Intelligence ─────────────────────────────────

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

-- ─── Feature 6: Memory Sentiment Tagging ────────────────────────────────────

ALTER TABLE hot_tier
  ADD COLUMN IF NOT EXISTS context_signals JSONB NOT NULL DEFAULT '{}';

ALTER TABLE warm_tier
  ADD COLUMN IF NOT EXISTS context_signals JSONB NOT NULL DEFAULT '{}';

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

ALTER TABLE sleep_phase_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sleep_phase_analytics_agent_isolation ON sleep_phase_analytics;
CREATE POLICY sleep_phase_analytics_agent_isolation ON sleep_phase_analytics
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- ─── Grants for memforge_app role (if exists) ───────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memforge_app') THEN
    EXECUTE 'GRANT ALL ON causal_edges TO memforge_app';
    EXECUTE 'GRANT ALL ON abstractions TO memforge_app';
    EXECUTE 'GRANT ALL ON sleep_phase_analytics TO memforge_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE causal_edges_id_seq TO memforge_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE abstractions_id_seq TO memforge_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE sleep_phase_analytics_id_seq TO memforge_app';
  END IF;
END $$;

COMMIT;
