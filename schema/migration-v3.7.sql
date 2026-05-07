-- MemForge — Migration v3.7: Anthropic Memory Store Bridge
--
-- Adds the `anthropic_memory_stores` table that records bidirectional
-- syncs between a (agent_id, namespace) MemForge tuple and an Anthropic
-- Memory Store. One row per linkage; updated on every push or pull.
-- The Bridge endpoints in src/app.ts use this table to detect drift
-- (last_pushed_at vs last_pulled_at vs current warm_tier mtime) and to
-- carry the external_store_id forward across calls.
--
-- Why a separate table from dream_runs:
--   dream_runs records *cycles* (one row per execution). The bridge link
--   is *relational state* between the two systems — long-lived, mutable,
--   one row per link. Different cardinality, different lifecycle.
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v3.7.sql

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'anthropic_memory_stores'
  ) THEN
    CREATE TABLE anthropic_memory_stores (
      id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id          TEXT         NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      namespace         TEXT         NOT NULL DEFAULT 'default',
      external_store_id TEXT         NOT NULL,
      direction         TEXT         NOT NULL CHECK (direction IN ('push', 'pull', 'bidirectional')),
      warm_row_count    INTEGER      NOT NULL DEFAULT 0,
      last_pushed_at    TIMESTAMPTZ,
      last_pulled_at    TIMESTAMPTZ,
      pushed_lsn        pg_lsn,
      metadata          JSONB        NOT NULL DEFAULT '{}'::jsonb,
      created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
      UNIQUE (agent_id, namespace, external_store_id)
    );

    CREATE INDEX anthropic_memory_stores_agent_ns_idx
      ON anthropic_memory_stores (agent_id, namespace);
  END IF;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE anthropic_memory_stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anthropic_memory_stores_agent_isolation ON anthropic_memory_stores;
CREATE POLICY anthropic_memory_stores_agent_isolation ON anthropic_memory_stores
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memforge_app') THEN
    EXECUTE 'GRANT ALL ON anthropic_memory_stores TO memforge_app';
  END IF;
END $$;
