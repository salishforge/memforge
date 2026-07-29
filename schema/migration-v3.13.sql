-- MemForge v3.13 — bi-temporal memory: event time distinct from ingestion time
--
-- `time_start`/`time_end` are populated from the contributing hot rows'
-- `created_at`, i.e. when MemForge *learned* something. For anything imported,
-- backfilled, replayed, or ingested after the fact, that is not when the event
-- *happened* — and every temporal feature keys off these columns: the
-- `after`/`before` query filters, temporal proximity scoring, and the timeline
-- endpoint. A conversation from 2023 ingested today filters as if it happened
-- today.
--
-- This is the standard bi-temporal split (valid time vs transaction time) used
-- by temporal knowledge graph systems. `occurred_at` records when the remembered
-- event took place; the existing columns keep recording when it was stored, so
-- provenance and audit questions ("what did we know, and when?") stay answerable.
--
-- Nullable by design: it is only known when the caller supplies it. Readers
-- must fall back to the ingestion columns, which preserves current behaviour
-- for every memory written before this migration.

ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;
ALTER TABLE hot_tier  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;

COMMENT ON COLUMN warm_tier.occurred_at IS
  'When the remembered event happened (valid time). NULL when unknown — readers fall back to time_start/consolidated_at, which record when it was ingested (transaction time).';
COMMENT ON COLUMN hot_tier.occurred_at IS
  'When the remembered event happened (valid time). NULL when unknown — readers fall back to created_at.';

-- Partial index: rows without an event time are served by the existing
-- time indexes, so indexing the NULLs again would be dead weight.
CREATE INDEX IF NOT EXISTS warm_tier_occurred_idx
  ON warm_tier (agent_id, occurred_at)
  WHERE occurred_at IS NOT NULL;
