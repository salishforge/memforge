-- MemForge — Migration v3.6: Dream Runs (Claude Dreaming compatibility, Parity layer)
--
-- Adds the `dream_runs` table that gives sleep cycles a first-class async job
-- model: a persistent record per run, with run id, immutable input snapshot
-- (warm-row id capture at run-start), status lifecycle, cancellation, and
-- output namespace mirroring Anthropic Dreams' "new memory store" semantics.
--
-- Why this exists separately from `consolidation_log`:
--   consolidation_log records hot→warm consolidation runs (a synchronous,
--   single-phase operation). dream_runs records the *full* sleep cycle as an
--   async job that may take minutes, run external (Anthropic) curation,
--   write to a new namespace, and be canceled mid-flight. Different cardinality
--   (one row per cycle vs many per consolidation), different lifecycle.
--
-- Worker model:
--   The application worker wakes on `LISTEN dream_runs_inserted` (preferred)
--   or polls the `dream_runs_pending_idx` partial index. Multi-instance
--   correctness is via `SELECT ... FOR UPDATE SKIP LOCKED` on status='pending'
--   in `src/dream-runs.ts`. No separate scheduler service.
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v3.6.sql

-- ─── dream_runs ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'dream_runs'
  ) THEN
    CREATE TABLE dream_runs (
      id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id                 TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      namespace                TEXT        NOT NULL DEFAULT 'default',
      session_ids              TEXT[],
      model                    TEXT        NOT NULL,
      instructions             TEXT        CHECK (instructions IS NULL OR length(instructions) <= 4096),
      status                   TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','running','completed','failed','canceled')),
      source                   TEXT        NOT NULL DEFAULT 'local'
                                CHECK (source IN ('local','anthropic','bridge_pull','bridge_push')),
      output_mode              TEXT        NOT NULL DEFAULT 'in_place'
                                CHECK (output_mode IN ('in_place','new_namespace')),
      output_namespace         TEXT,
      input_warm_ids           BIGINT[],
      input_snapshot_lsn       pg_lsn,
      external_dream_id        TEXT,
      external_memory_store_id TEXT,
      external_output_store_id TEXT,
      usage_in_tokens          INTEGER     NOT NULL DEFAULT 0,
      usage_out_tokens         INTEGER     NOT NULL DEFAULT 0,
      cost_usd_micros          BIGINT      NOT NULL DEFAULT 0,
      sleep_cycle_result       JSONB,
      error                    TEXT,
      cancel_requested_at      TIMESTAMPTZ,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
      started_at               TIMESTAMPTZ,
      completed_at             TIMESTAMPTZ,
      -- Session-id list cap mirrors Anthropic Dreams' ≤100 limit so the API
      -- shape can pass through unchanged when used as a Drop-in target.
      CONSTRAINT dream_runs_session_ids_cap CHECK (
        session_ids IS NULL OR array_length(session_ids, 1) <= 100
      )
    );

    CREATE INDEX dream_runs_agent_status_idx
      ON dream_runs (agent_id, status, created_at DESC);

    CREATE INDEX dream_runs_external_idx
      ON dream_runs (external_dream_id)
      WHERE external_dream_id IS NOT NULL;

    -- Partial index — worker wake-up scan only pays for in-flight rows.
    CREATE INDEX dream_runs_pending_idx
      ON dream_runs (status, created_at)
      WHERE status IN ('pending','running');
  END IF;
END $$;

-- ─── LISTEN/NOTIFY trigger ───────────────────────────────────────────────────
-- Worker wakes on insert via `LISTEN dream_runs_inserted` and reads the
-- pending row via FOR UPDATE SKIP LOCKED. The poll fallback in src/dream-runs.ts
-- handles cases where LISTEN is unavailable (e.g., a hot standby read replica).

CREATE OR REPLACE FUNCTION dream_runs_notify_inserted()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('dream_runs_inserted', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dream_runs_notify_inserted_trg ON dream_runs;
CREATE TRIGGER dream_runs_notify_inserted_trg
  AFTER INSERT ON dream_runs
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION dream_runs_notify_inserted();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Same agent-scoped pattern as warm_tier / hot_tier in schema.sql.
-- FORCE ROW LEVEL SECURITY intentionally omitted — application role bypasses
-- RLS; policy applies only to non-owner roles (read-only analysts, etc.).
-- See DEPLOYMENT-SECURITY.md.

ALTER TABLE dream_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dream_runs_agent_isolation ON dream_runs;
CREATE POLICY dream_runs_agent_isolation ON dream_runs
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memforge_app') THEN
    EXECUTE 'GRANT ALL ON dream_runs TO memforge_app';
  END IF;
END $$;
