#!/bin/sh
set -e

# ── 1. Initialise PostgreSQL data directory if needed ────────────────────────
PGDATA="${PGDATA:-/var/lib/postgresql/data}"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "[standalone] Initialising PostgreSQL data directory..."
    su-exec postgres initdb -D "$PGDATA" --encoding=UTF8 --auth=trust
fi

# ── 2. Start PostgreSQL in the background ────────────────────────────────────
echo "[standalone] Starting PostgreSQL..."
su-exec postgres pg_ctl -D "$PGDATA" -l "$PGDATA/pg.log" start -w \
    -o "-c listen_addresses=localhost -c max_connections=50"

# ── 3. Create database and apply schema ──────────────────────────────────────
echo "[standalone] Creating database..."
su-exec postgres createdb memforge 2>/dev/null || true

echo "[standalone] Applying schema..."
su-exec postgres psql -d memforge -f /app/schema/schema.sql 2>/dev/null || true

# Apply any available migrations in version order
for f in $(ls /app/schema/migration-*.sql 2>/dev/null | sort); do
    echo "[standalone] Applying migration: $f"
    su-exec postgres psql -d memforge -f "$f" 2>/dev/null || true
done

# ── 4. Verify extensions ─────────────────────────────────────────────────────
echo "[standalone] Verifying extensions..."
su-exec postgres psql -d memforge -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true
su-exec postgres psql -d memforge -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" 2>/dev/null || true

# ── 5. Start MemForge ────────────────────────────────────────────────────────
echo "[standalone] Starting MemForge on port ${PORT:-3333}..."
exec node /app/dist/server.js
