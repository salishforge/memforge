-- MemForge migration v3.3 — Phase 4: Continuous Adaptation
-- Adds: warm_tier.valid_until, warm_tier.embedding_model,
--       procedures outcome tracking, drift_signals table
-- Run: psql "$DATABASE_URL" -f schema/migration-v3.3.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- Temporal knowledge management — validity window on warm_tier
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'warm_tier' AND column_name = 'valid_until'
  ) THEN
    ALTER TABLE warm_tier ADD COLUMN valid_until TIMESTAMPTZ;
    CREATE INDEX warm_tier_valid_until_idx ON warm_tier (agent_id, valid_until)
      WHERE valid_until IS NOT NULL;
  END IF;
END $$;

-- Track which embedding model produced each row's embedding.
-- Enables incremental re-embedding when the provider/model changes.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'warm_tier' AND column_name = 'embedding_model'
  ) THEN
    ALTER TABLE warm_tier ADD COLUMN embedding_model TEXT;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Procedural evolution — outcome tracking on procedures
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'procedures' AND column_name = 'success_count'
  ) THEN
    ALTER TABLE procedures ADD COLUMN success_count INT NOT NULL DEFAULT 0;
    ALTER TABLE procedures ADD COLUMN failure_count INT NOT NULL DEFAULT 0;
    ALTER TABLE procedures ADD COLUMN last_outcome TEXT CHECK (last_outcome IN ('positive', 'negative', 'neutral'));
    ALTER TABLE procedures ADD COLUMN last_outcome_at TIMESTAMPTZ;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Drift detection — per-agent drift signal snapshots
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'drift_signals') THEN
    CREATE TABLE drift_signals (
      id                  BIGSERIAL   PRIMARY KEY,
      agent_id            TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      measured_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      contradiction_rate  REAL        NOT NULL DEFAULT 0,
      staleness_p90       REAL        NOT NULL DEFAULT 0,
      revision_velocity   REAL        NOT NULL DEFAULT 0,
      stale_cluster_count INT         NOT NULL DEFAULT 0,
      expired_count       INT         NOT NULL DEFAULT 0
    );
    CREATE INDEX drift_signals_agent_idx ON drift_signals (agent_id, measured_at DESC);
  END IF;
END $$;
