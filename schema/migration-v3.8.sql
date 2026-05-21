-- MemForge — Migration v3.8: Sentiment Tagging + Adaptive Sleep Intelligence
--
-- Features:
--   F5: Adaptive Sleep Intelligence (sleep_phase_analytics table)
--   F6: Memory Sentiment Tagging (context_signals on hot_tier and warm_tier)
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v3.8.sql

BEGIN;

-- ─── Feature 5: Adaptive Sleep Intelligence ─────────────────────────────────
--
-- Records per-phase telemetry for each sleep cycle run. The sleep cycle engine
-- reads the last 3 records per (agent, phase) to decide whether to skip a
-- phase that has produced zero changes across all recent runs — avoiding wasted
-- work on idle agents.

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

ALTER TABLE sleep_phase_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sleep_phase_analytics_agent_isolation ON sleep_phase_analytics;
CREATE POLICY sleep_phase_analytics_agent_isolation ON sleep_phase_analytics
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- ─── Feature 6: Memory Sentiment Tagging ────────────────────────────────────
--
-- JSONB column storing urgency, sentiment, and session_type signals inferred
-- from content at write time. On hot_tier the signals are per-event; during
-- consolidation the signals from all contributing hot rows are merged into the
-- warm_tier row (urgency = max, sentiment = majority, session_type = majority).

ALTER TABLE hot_tier
  ADD COLUMN IF NOT EXISTS context_signals JSONB NOT NULL DEFAULT '{}';

ALTER TABLE warm_tier
  ADD COLUMN IF NOT EXISTS context_signals JSONB NOT NULL DEFAULT '{}';

-- ─── Grants for memforge_app role (if exists) ───────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memforge_app') THEN
    EXECUTE 'GRANT ALL ON sleep_phase_analytics TO memforge_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE sleep_phase_analytics_id_seq TO memforge_app';
  END IF;
END $$;

COMMIT;
