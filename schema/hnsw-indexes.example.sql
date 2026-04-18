-- MemForge — Optional HNSW Indexes for Semantic Search
--
-- Fixes: #95 (halfvec HNSW indexes need an explicit dimension).
--
-- The canonical schema.sql declares embedding columns as bare `halfvec` (no
-- dimension) so a fresh install works with any embedding provider. pgvector
-- requires halfvec columns to have a concrete dimension before an HNSW index
-- can be built. This file is a template operators apply AFTER choosing their
-- embedding provider.
--
-- Usage:
--   1. Pick your embedding provider and find its vector dimension:
--      - bge-small-en-v1.5 (default local)  → 384
--      - nomic-embed-text                   → 768
--      - text-embedding-3-small (OpenAI)    → 1536
--      - text-embedding-3-large (OpenAI)    → 3072
--      - (custom) → whatever your model outputs
--   2. Edit the three DIMENSION placeholders below to match your provider.
--   3. Apply: psql "$DATABASE_URL" -f schema/hnsw-indexes.example.sql
--
-- You can skip this file entirely if:
--   - You're not using embeddings (EMBEDDING_PROVIDER=none), OR
--   - Your warm tier is small enough that seq-scan similarity is fine
--     (typically <50k rows; pgvector's bare halfvec supports cosine distance
--     via the <=> operator without an index — just slower).
--
-- Re-running is safe: ALTER COLUMN TYPE uses USING to cast, and CREATE INDEX
-- has IF NOT EXISTS. ALTER COLUMN TYPE on a populated column rewrites the
-- table — plan for maintenance window on large tables.

-- ─── warm_tier ──────────────────────────────────────────────────────────────
-- Pin warm_tier.embedding to your provider's dimension, then build the HNSW
-- index for fast cosine similarity search.

ALTER TABLE warm_tier
  ALTER COLUMN embedding TYPE halfvec(384) USING embedding::halfvec(384);

CREATE INDEX IF NOT EXISTS warm_tier_embedding_idx
  ON warm_tier USING hnsw (embedding halfvec_cosine_ops);

-- ─── shared_memories ────────────────────────────────────────────────────────
-- Only needed if you're using cross-agent shared memory pools (otherwise
-- this table stays empty and the index is harmless but unnecessary).

ALTER TABLE shared_memories
  ALTER COLUMN embedding TYPE halfvec(384) USING embedding::halfvec(384);

CREATE INDEX IF NOT EXISTS shared_memories_embedding_idx
  ON shared_memories USING hnsw (embedding halfvec_cosine_ops);

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- SELECT attname, format_type(atttypid, atttypmod) AS type
-- FROM pg_attribute
-- WHERE attrelid = 'warm_tier'::regclass AND attname = 'embedding';
-- Expected: embedding | halfvec(384)  (or whatever dimension you chose)
--
-- SELECT indexname FROM pg_indexes
-- WHERE tablename IN ('warm_tier', 'shared_memories')
--   AND indexname LIKE '%embedding_idx';
-- Expected: warm_tier_embedding_idx, shared_memories_embedding_idx
