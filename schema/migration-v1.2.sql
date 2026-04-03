-- MemForge v1.2.0 Migration — Vector Search + Temporal Intelligence
--
-- Run against an existing v1.1.0 database:
--   psql "$DATABASE_URL" -f schema/migration-v1.2.sql
--
-- Safe to run multiple times (all statements are idempotent).

-- ─── pgvector extension ──────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── warm_tier: vector embedding column ──────────────────────────────────────
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS embedding vector;

-- ─── warm_tier: temporal bounds ──────────────────────────────────────────────
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS time_start TIMESTAMPTZ;
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS time_end   TIMESTAMPTZ;

-- ─── warm_tier: access tracking ──────────────────────────────────────────────
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS access_count  INT NOT NULL DEFAULT 0;
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMPTZ;

-- ─── New indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS warm_tier_embedding_idx ON warm_tier USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS warm_tier_time_idx     ON warm_tier (agent_id, time_start, time_end);
