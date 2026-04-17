#!/usr/bin/env bash
# verify-rls.sh — asserts that Row-Level Security on hot_tier actually isolates
# agent data when accessed by a non-owner role.
#
# Prerequisites:
#   - DATABASE_URL env var pointing at a Postgres connection for the DB owner
#     (the role that installed schema.sql, i.e., the table owner).
#   - schema/schema.sql must already have been applied (RLS policies in place).
#   - psql must be on PATH.
#
# Exit codes:
#   0 — all assertions passed
#   1 — one or more assertions failed, or a required env var is missing

set -euo pipefail

# ─── helpers ─────────────────────────────────────────────────────────────────

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  echo "  [PASS] $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  echo "  [FAIL] $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

assert_eq() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    pass "$label (got: $actual)"
  else
    fail "$label — expected '$expected', got '$actual'"
  fi
}

# Run a query as the owner (DATABASE_URL) and return trimmed output.
owner_query() {
  psql "$DATABASE_URL" -tA -c "$1"
}

# Run a query as rls_test_reader (constructed connection string) and return output.
reader_query() {
  PGPASSWORD="$READER_PASSWORD" psql "$READER_URL" -tA -c "$1"
}

# ─── env checks ──────────────────────────────────────────────────────────────

echo "=== MemForge RLS Enforcement Verification ==="
echo ""

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Export the owner connection string before running this script."
  exit 1
fi

echo "Owner connection: ${DATABASE_URL//:*@/://<redacted>@}"

# ─── constants ───────────────────────────────────────────────────────────────

READER_ROLE="rls_test_reader"
READER_PASSWORD="rls_test_pw_$(date +%s)"

# Parse DATABASE_URL to build a reader URL.
# Expected format: postgresql://user:pass@host:port/dbname
# We replace user:pass with the new role credentials.
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|postgresql://[^@]+@([^:/]+).*|\1|')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+).*|\1|')

READER_URL="postgresql://${READER_ROLE}:${READER_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# ─── setup ───────────────────────────────────────────────────────────────────

echo "--- Setup ---"

echo "Creating test agents..."
owner_query "INSERT INTO agents (id) VALUES ('rls-test-agent-a') ON CONFLICT (id) DO NOTHING;" > /dev/null
owner_query "INSERT INTO agents (id) VALUES ('rls-test-agent-b') ON CONFLICT (id) DO NOTHING;" > /dev/null

echo "Inserting test rows as owner (bypasses RLS)..."
owner_query "INSERT INTO hot_tier (agent_id, content) VALUES ('rls-test-agent-a', 'secret-data-agent-a');" > /dev/null
owner_query "INSERT INTO hot_tier (agent_id, content) VALUES ('rls-test-agent-b', 'secret-data-agent-b');" > /dev/null

echo "Creating read-only role '${READER_ROLE}'..."
# Drop role if it already exists from a previous failed run
owner_query "DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${READER_ROLE}') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${READER_ROLE}';
    EXECUTE 'DROP ROLE ${READER_ROLE}';
  END IF;
END;
\$\$;" > /dev/null

owner_query "CREATE ROLE ${READER_ROLE} LOGIN PASSWORD '${READER_PASSWORD}';" > /dev/null
owner_query "GRANT SELECT ON hot_tier TO ${READER_ROLE};" > /dev/null

echo ""
echo "--- Assertions ---"

# ─── assertion 1: SET app.current_agent_id = agent-a → 1 row for agent-a ─────

ROWS=$(reader_query "
  SET app.current_agent_id = 'rls-test-agent-a';
  SELECT COUNT(*) FROM hot_tier;
" | tail -1)
assert_eq "Agent-A context: row count visible" "1" "$ROWS"

AGENT=$(reader_query "
  SET app.current_agent_id = 'rls-test-agent-a';
  SELECT agent_id FROM hot_tier LIMIT 1;
" | tail -1)
assert_eq "Agent-A context: row belongs to agent-a" "rls-test-agent-a" "$AGENT"

# ─── assertion 2: SET app.current_agent_id = agent-b → 1 row for agent-b ─────

ROWS=$(reader_query "
  SET app.current_agent_id = 'rls-test-agent-b';
  SELECT COUNT(*) FROM hot_tier;
" | tail -1)
assert_eq "Agent-B context: row count visible" "1" "$ROWS"

AGENT=$(reader_query "
  SET app.current_agent_id = 'rls-test-agent-b';
  SELECT agent_id FROM hot_tier LIMIT 1;
" | tail -1)
assert_eq "Agent-B context: row belongs to agent-b" "rls-test-agent-b" "$AGENT"

# ─── assertion 3: no app.current_agent_id set → 0 rows ────────────────────────
# We use a fresh connection (no SET) to simulate the default-NULL case.
# current_setting('app.current_agent_id', true) returns NULL when not set,
# and NULL = agent_id is false → all rows are filtered out.

ROWS=$(reader_query "SELECT COUNT(*) FROM hot_tier;")
assert_eq "No context set: 0 rows visible (NULL agent filter)" "0" "$ROWS"

# ─── assertion 4: cross-agent leak check (agent-b cannot see agent-a data) ───

LEAK=$(reader_query "
  SET app.current_agent_id = 'rls-test-agent-b';
  SELECT COUNT(*) FROM hot_tier WHERE agent_id = 'rls-test-agent-a';
" | tail -1)
assert_eq "Agent-B cannot read agent-A rows" "0" "$LEAK"

# ─── cleanup ──────────────────────────────────────────────────────────────────

echo ""
echo "--- Cleanup ---"

echo "Removing test data and role..."
owner_query "DELETE FROM agents WHERE id IN ('rls-test-agent-a', 'rls-test-agent-b');" > /dev/null
owner_query "REVOKE SELECT ON hot_tier FROM ${READER_ROLE};" > /dev/null
owner_query "DROP ROLE IF EXISTS ${READER_ROLE};" > /dev/null

echo ""

# ─── result ───────────────────────────────────────────────────────────────────

TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo "=== Results: ${PASS_COUNT}/${TOTAL} passed ==="

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "FAIL — ${FAIL_COUNT} assertion(s) failed. RLS may not be enforced correctly."
  exit 1
fi

echo "PASS — All RLS assertions succeeded. Cross-agent data isolation is working."
exit 0
