-- MemForge Migration v2.5 — FABLE-Inspired Enhancements
--
-- 1. Hierarchical summaries: summary column on warm_tier
--
-- Inspired by FABLE (arXiv 2601.18116) multi-granularity indexing
-- and MemPalace (MIT) closets/drawers pattern.
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v2.5.sql

-- Summary column — populated during LLM-mode consolidation, NULL in concat mode
ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS summary TEXT;
