-- MemForge v1.3.0 Migration — Knowledge Graph (Entity Graph)
--
-- Run against an existing v1.2.0 database:
--   psql "$DATABASE_URL" -f schema/migration-v1.3.sql
--
-- Safe to run multiple times (all statements are idempotent).

-- ─── entities — knowledge graph nodes ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entities (
  id              BIGSERIAL   PRIMARY KEY,
  agent_id        TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  entity_type     TEXT        NOT NULL DEFAULT 'other',
  metadata        JSONB       NOT NULL DEFAULT '{}',
  first_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
  mention_count   INT         NOT NULL DEFAULT 1,
  UNIQUE (agent_id, name)
);

CREATE INDEX IF NOT EXISTS entities_agent_id_idx  ON entities (agent_id);
CREATE INDEX IF NOT EXISTS entities_name_idx      ON entities (agent_id, name);
CREATE INDEX IF NOT EXISTS entities_type_idx      ON entities (agent_id, entity_type);

-- ─── relationships — knowledge graph edges ───────────────────────────────────
CREATE TABLE IF NOT EXISTS relationships (
  id                BIGSERIAL   PRIMARY KEY,
  agent_id          TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  source_entity_id  BIGINT      NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id  BIGINT      NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type     TEXT        NOT NULL,
  weight            REAL        NOT NULL DEFAULT 1.0,
  metadata          JSONB       NOT NULL DEFAULT '{}',
  first_seen        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, source_entity_id, target_entity_id, relation_type)
);

CREATE INDEX IF NOT EXISTS relationships_agent_id_idx ON relationships (agent_id);
CREATE INDEX IF NOT EXISTS relationships_source_idx   ON relationships (source_entity_id);
CREATE INDEX IF NOT EXISTS relationships_target_idx   ON relationships (target_entity_id);

-- ─── warm_tier_entities — junction table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS warm_tier_entities (
  warm_tier_id    BIGINT  NOT NULL REFERENCES warm_tier(id) ON DELETE CASCADE,
  entity_id       BIGINT  NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (warm_tier_id, entity_id)
);

CREATE INDEX IF NOT EXISTS warm_tier_entities_entity_idx ON warm_tier_entities (entity_id);
