-- MemForge Migration v2.7 — Vector Compression
--
-- Switch embedding storage from vector (float32) to halfvec (float16).
-- 2x storage reduction with minimal quality impact.
-- Validated by TurboQuant research (Google, 2026) showing 3-4 bit
-- quantization preserves retrieval quality at near-theoretical bounds.
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v2.7.sql
--
-- NOTE: This migration converts existing embeddings. On large tables
-- (100K+ rows with embeddings), this may take several minutes.

-- Drop existing index (incompatible with new type)
DROP INDEX IF EXISTS warm_tier_embedding_idx;

-- Convert column from vector to halfvec
ALTER TABLE warm_tier ALTER COLUMN embedding TYPE halfvec USING embedding::halfvec;

-- Recreate HNSW index with halfvec operator class
CREATE INDEX IF NOT EXISTS warm_tier_embedding_idx ON warm_tier USING hnsw (embedding halfvec_cosine_ops);
