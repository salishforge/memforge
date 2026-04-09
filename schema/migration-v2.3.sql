-- MemForge Migration v2.3 — Security Hardening
--
-- 1. Row-Level Security on all agent-scoped tables
-- 2. Audit chain delete prevention trigger
-- 3. Default statement timeout
--
-- Apply: psql "$DATABASE_URL" -f schema/migration-v2.3.sql

-- ─── Part A: Row-Level Security ─────────────────────────────────────────────────

ALTER TABLE hot_tier ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for hot_tier.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
CREATE POLICY hot_tier_agent_isolation ON hot_tier
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE warm_tier ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for warm_tier.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
CREATE POLICY warm_tier_agent_isolation ON warm_tier
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE cold_tier ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for cold_tier.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
CREATE POLICY cold_tier_agent_isolation ON cold_tier
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE consolidation_log ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for consolidation_log.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
CREATE POLICY consolidation_log_agent_isolation ON consolidation_log
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for entities.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
CREATE POLICY entities_agent_isolation ON entities
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for relationships.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
CREATE POLICY relationships_agent_isolation ON relationships
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for reflections.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
CREATE POLICY reflections_agent_isolation ON reflections
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE retrieval_log ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for retrieval_log.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
CREATE POLICY retrieval_log_agent_isolation ON retrieval_log
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE memory_revisions ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for memory_revisions.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
CREATE POLICY memory_revisions_agent_isolation ON memory_revisions
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for procedures.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
CREATE POLICY procedures_agent_isolation ON procedures
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE audit_chain ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for audit_chain.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
CREATE POLICY audit_chain_agent_isolation ON audit_chain
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE cold_audit ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for cold_audit.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
CREATE POLICY cold_audit_agent_isolation ON cold_audit
  FOR ALL
  USING (agent_id = current_setting('app.current_agent_id', true))
  WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- warm_tier_entities has no agent_id column — join through warm_tier
ALTER TABLE warm_tier_entities ENABLE ROW LEVEL SECURITY;
-- Note: FORCE ROW LEVEL SECURITY intentionally omitted for warm_tier_entities.
-- RLS applies to non-owner roles only (e.g., read-only analyst access).
-- The application role (table owner or memforge_app member) bypasses RLS.
-- See DEPLOYMENT-SECURITY.md for details.
CREATE POLICY warm_tier_entities_agent_isolation ON warm_tier_entities
  FOR ALL
  USING (warm_tier_id IN (SELECT id FROM warm_tier WHERE agent_id = current_setting('app.current_agent_id', true)))
  WITH CHECK (warm_tier_id IN (SELECT id FROM warm_tier WHERE agent_id = current_setting('app.current_agent_id', true)));

-- ─── Service role that bypasses RLS ─────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memforge_app') THEN
    CREATE ROLE memforge_app NOLOGIN;
  END IF;
END $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO memforge_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO memforge_app;
-- Application connects as a login role that is a member of memforge_app
-- RLS protects against direct psql access with other roles

-- ─── Part B: Audit delete prevention ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_audit_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Direct deletion from audit_chain is not allowed. Use the archiveExpired() API.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Only prevent deletes that don't come from the archive function
-- The archive function sets a session variable before deleting
DROP TRIGGER IF EXISTS audit_chain_no_delete ON audit_chain;
CREATE TRIGGER audit_chain_no_delete
  BEFORE DELETE ON audit_chain
  FOR EACH ROW
  WHEN (current_setting('memforge.archive_in_progress', true) IS DISTINCT FROM 'true')
  EXECUTE FUNCTION prevent_audit_delete();

-- ─── Part C: Default statement timeout ──────────────────────────────────────────

-- Safety net: kill queries running longer than 30 seconds
-- Can be overridden per-session if needed
ALTER DATABASE memforge SET statement_timeout = '30s';
