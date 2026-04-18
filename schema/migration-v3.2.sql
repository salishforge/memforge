-- MemForge migration v3.2 — Phase 3 completion
-- Adds: shared_procedures, agent_roles
-- Run: psql "$DATABASE_URL" -f schema/migration-v3.2.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- shared_procedures — condition→action rules published to shared pools
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shared_procedures') THEN
    CREATE TABLE shared_procedures (
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
    CREATE INDEX shared_procedures_pool_idx   ON shared_procedures (pool_id);
    CREATE INDEX shared_procedures_agent_idx  ON shared_procedures (source_agent_id);
    CREATE INDEX shared_procedures_active_idx ON shared_procedures (pool_id, active) WHERE active = true;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- agent_roles — declared or auto-detected expertise domains per agent
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_roles') THEN
    CREATE TABLE agent_roles (
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
    CREATE INDEX agent_roles_agent_idx ON agent_roles (agent_id);
  END IF;
END $$;
