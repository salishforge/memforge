-- MemForge v2.2.0 Migration — Temporal Audit Chain with Integrity Verification
--
-- Provides an immutable, hash-chained audit log of all warm-tier mutations.
-- Each record captures: what changed, when, why, and a cryptographic link
-- to the previous record (tamper detection).
--
-- Retention: records are immutable during AUDIT_RETENTION_DAYS (default 90).
-- After retention, records are either archived to cold_audit or pruned.

-- ─── Content hash on warm_tier ──────────────────────────────────────────────
-- HMAC-SHA256 of content, verifiable at any time to detect direct DB tampering.

ALTER TABLE warm_tier ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL DEFAULT '';

-- ─── Temporal audit chain ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_chain (
  id              BIGSERIAL   PRIMARY KEY,
  agent_id        TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  -- What was changed
  target_table    TEXT        NOT NULL CHECK (target_table IN ('warm_tier', 'entities', 'relationships', 'reflections', 'procedures')),
  target_id       BIGINT      NOT NULL,

  -- Temporal: when this version was valid
  operation       TEXT        NOT NULL CHECK (operation IN ('create', 'update', 'delete', 'revise', 'merge', 'evict', 'score', 'feedback')),
  valid_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until     TIMESTAMPTZ,  -- NULL = current version

  -- Content snapshot
  content_before  TEXT,          -- NULL on create
  content_after   TEXT,          -- NULL on delete
  metadata_delta  JSONB       NOT NULL DEFAULT '{}',  -- what changed in metadata/scores

  -- Integrity chain
  content_hash    TEXT        NOT NULL,  -- HMAC-SHA256 of content_after (or content_before for deletes)
  previous_hash   TEXT        NOT NULL DEFAULT '',  -- hash of the previous audit_chain record for this target
  chain_hash      TEXT        NOT NULL,  -- HMAC-SHA256(previous_hash + content_hash + operation + valid_from)

  -- Context
  triggered_by    TEXT        NOT NULL DEFAULT 'api',  -- 'api', 'sleep_cycle', 'consolidation', 'reflection', 'dedup', 'feedback'
  model_used      TEXT,       -- LLM model if this was an AI-driven change

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_chain_agent_idx ON audit_chain (agent_id);
CREATE INDEX IF NOT EXISTS audit_chain_target_idx ON audit_chain (target_table, target_id);
CREATE INDEX IF NOT EXISTS audit_chain_created_idx ON audit_chain (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_chain_valid_idx ON audit_chain (valid_from, valid_until);

-- ─── Cold audit (archived audit records past retention) ─────────────────────

CREATE TABLE IF NOT EXISTS cold_audit (
  id              BIGSERIAL   PRIMARY KEY,
  agent_id        TEXT        NOT NULL,
  target_table    TEXT        NOT NULL,
  target_id       BIGINT      NOT NULL,
  operation       TEXT        NOT NULL,
  valid_from      TIMESTAMPTZ NOT NULL,
  valid_until     TIMESTAMPTZ,
  content_hash    TEXT        NOT NULL,
  chain_hash      TEXT        NOT NULL,
  triggered_by    TEXT        NOT NULL,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  original_created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS cold_audit_agent_idx ON cold_audit (agent_id);
CREATE INDEX IF NOT EXISTS cold_audit_target_idx ON cold_audit (target_table, target_id);
