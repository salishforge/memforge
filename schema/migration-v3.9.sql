-- MemForge — Migration v3.9: Epistemic Confidence Model
--
-- Feature 1 of the Phase 5 Autonomous Knowledge Architecture split.
--
-- Adds calibrated uncertainty levels to warm-tier memories:
--   established   — corroborated by multiple positive retrievals across sessions
--   provisional   — default; accepted but not yet confirmed
--   contested     — contradicted by a conflicting memory
--   inferred      — derived by the sleep cycle, not directly observed
--   deprecated    — superseded or stale; retained for audit purposes
--
-- Sleep Phase 5.12 (phaseEpistemicPromotion) runs each cycle and automatically
-- promotes provisional → established when evidence_count >= 3 and the memory
-- has been retrieved positively from at least 2 distinct namespaces.
-- It also demotes established → provisional when staleness_score > 0.7 and
-- the row has not been accessed in 30 days.
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v3.9.sql

BEGIN;

-- ─── Feature 1: Epistemic Confidence Model ──────────────────────────────────

ALTER TABLE warm_tier
  ADD COLUMN IF NOT EXISTS epistemic_status     TEXT    NOT NULL DEFAULT 'provisional',
  ADD COLUMN IF NOT EXISTS evidence_count       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_corroborated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS warm_tier_epistemic_idx
  ON warm_tier (agent_id, epistemic_status);

COMMIT;
