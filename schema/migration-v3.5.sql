-- MemForge — Migration v3.5: Per-Session Hot Tier Tagging
--
-- Adds `session_id` to hot_tier (NOT NULL, default 'default') and warm_tier
-- (nullable — records the originating session of a consolidated row, for
-- provenance). Enables multi-device usage where the same agent_id is shared
-- across devices but each device's in-flight events stay isolated until
-- consolidation aggregates them.
--
-- Why a column and not metadata JSONB:
--   "Two devices, same project" is the common case for a multi-device agent.
--   The hot-tier query "fetch only my session's events" runs per request and
--   must use an index. metadata JSONB filtering would force a sequential scan
--   on every request. A typed column with a composite index keeps the cost
--   linear in the caller's session, not the agent's full backlog.
--
-- Backward compatibility:
--   The default 'default' makes existing single-device deployments behave
--   identically to today. Pre-existing warm rows have session_id = NULL,
--   meaning "consolidated before per-session tracking existed" — distinct
--   from a row whose source events all came from the literal 'default'
--   session.
--
-- Safe to re-run via the same DO $$ EXCEPTION pattern used in v3.1.
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v3.5.sql

-- ─── hot_tier ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE hot_tier ADD COLUMN session_id TEXT NOT NULL DEFAULT 'default';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS hot_tier_session_idx
  ON hot_tier (agent_id, namespace, session_id);

-- ─── warm_tier ───────────────────────────────────────────────────────────────
-- Nullable on warm_tier: pre-migration rows have no originating session.

DO $$ BEGIN
  ALTER TABLE warm_tier ADD COLUMN session_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS warm_tier_session_idx
  ON warm_tier (agent_id, namespace, session_id)
  WHERE session_id IS NOT NULL;
