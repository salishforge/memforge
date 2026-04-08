-- MemForge Migration v2.4 — Community-Inspired Enhancements
--
-- 1. Fix: retrieval_log missing feedback columns
-- 2. Content deduplication hash on hot_tier (#52)
-- 3. Outcome tagging on warm_tier (#51)
-- 4. Confidence graduation on warm_tier (#50)
-- 5. Code-preserving FTS column on warm_tier (#55) [REQUIRES MAINTENANCE WINDOW — ACCESS EXCLUSIVE lock]
-- 6. Sleep cycle tracking on agents (#54)
-- 7. Per-agent scoring weights (#57)
--
-- Inspired by: hippo-memory (MIT), MH-FLOCKE (Apache 2.0),
--              claude-code-toolkit (MIT), CCRider (MIT)
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v2.4.sql
--
-- WARNING: The content_code_tsv GENERATED column (step 5) acquires an
-- ACCESS EXCLUSIVE lock on warm_tier during the ALTER TABLE. Schedule
-- during a maintenance window if the table has significant data.

-- ─── 1. Fix retrieval_log feedback columns ──────────────────────────────────

ALTER TABLE retrieval_log ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE retrieval_log ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;
ALTER TABLE retrieval_log ADD COLUMN IF NOT EXISTS feedback_metadata JSONB DEFAULT '{}';

-- ─── 2. Content dedup hash on hot_tier (#52) ────────────────────────────────

ALTER TABLE hot_tier ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS hot_tier_content_hash_idx ON hot_tier (agent_id, content_hash);

-- ─── 3. Outcome tagging on warm_tier (#51) ──────────────────────────────────

ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS outcome_type TEXT NOT NULL DEFAULT 'neutral'
  CHECK (outcome_type IN ('error', 'success', 'decision', 'observation', 'neutral'));

-- ─── 4. Confidence graduation on warm_tier (#50) ────────────────────────────

ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS graduated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS retrieval_success_count INT NOT NULL DEFAULT 0;
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS first_successful_retrieval TIMESTAMPTZ;

-- ─── 5. Code-preserving FTS column (#55) ────────────────────────────────────
-- NOTE: GENERATED column requires ACCESS EXCLUSIVE lock on the table.

ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS content_code_tsv TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;
CREATE INDEX IF NOT EXISTS warm_tier_code_tsv_idx ON warm_tier USING GIN (content_code_tsv);

-- ─── 6. Sleep cycle tracking on agents (#54) ────────────────────────────────

ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_sleep_cycle TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS sleep_cycle_cost_tokens BIGINT NOT NULL DEFAULT 0;

-- ─── 7. Per-agent scoring weights (#57) ─────────────────────────────────────

ALTER TABLE agents ADD COLUMN IF NOT EXISTS scoring_weights JSONB;
