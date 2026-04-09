# MemForge Deployment Security Guide

Production hardening checklist and reference architecture.

---

## Required Environment Variables

All variables are read at startup. Restart the process after changes.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | **yes** | `development` | Must be `production` — enables AUDIT_HMAC_KEY enforcement and changes log level defaults |
| `DATABASE_URL` | **yes** | — | Must use TLS: `?sslmode=require` |
| `AUDIT_HMAC_KEY` | **yes in production** | `''` | HMAC-SHA256 key for audit chain integrity. Empty string in production throws at startup. |
| `ADMIN_TOKEN` | **yes** | `''` | Bearer token for `/admin/*` and `/metrics`. Empty string disables admin endpoints entirely (safe default). |
| `OAUTH2_REQUIRED` | **yes** | `'true'`* | Set to `'true'`. Setting `'false'` allows unauthenticated requests — only for local development. |
| `OAUTH2_INTROSPECT_URL` | **yes** | `http://localhost:3005/oauth2/introspect` | URL of your OAuth2 server's introspect endpoint |
| `CORS_ORIGIN` | **yes** | unset (no CORS headers) | Comma-separated list of allowed origins. Never `*` in production. Omit entirely if API is server-to-server only. |
| `REDIS_URL` | recommended | `redis://localhost:6379` | Include AUTH token: `redis://:password@host:6379`. Missing Redis degrades to no cache. |
| `ALLOW_REMOTE_LLM` | **yes** | `'false'` | Keep `'false'` unless you have reviewed THREAT_MODEL.md §1 and accept the data exfiltration risk. |
| `LLM_PROVIDER` | situational | `'none'` | `'anthropic'`, `'openai'`, `'ollama'`, or `'none'`. `'none'` disables summarize-mode consolidation, reflection, and sleep cycle Phase 3/5. |
| `EMBEDDING_PROVIDER` | situational | `'none'` | `'openai'` or `'ollama'`. `'none'` disables semantic/hybrid search. |
| `ANTHROPIC_API_KEY` | if `LLM_PROVIDER=anthropic` | — | Treat as a secret credential |
| `OPENAI_API_KEY` | if using OpenAI provider | — | Treat as a secret credential |
| `OLLAMA_BASE_URL` | if using Ollama | `http://localhost:11434` | Ensure Ollama is not externally accessible |
| `REVISION_LLM_PROVIDER` | optional | falls back to `LLM_PROVIDER` | Separate provider for sleep cycle revisions. Set to `'ollama'` to keep revision traffic local even when main LLM is remote. |
| `LOG_LEVEL` | optional | `'info'` | `'trace'`, `'debug'`, `'info'`, `'warn'`, `'error'`, `'fatal'` |
| `AUDIT_RETENTION_DAYS` | optional | `90` | Minimum days to keep audit records immutable |
| `AUDIT_ARCHIVE_ON_EXPIRY` | optional | `'true'` | `'true'` archives to `cold_audit`; `'false'` deletes. |
| `COLD_TIER_RETENTION_DAYS` | optional | unlimited | Minimum `1`. Memories in cold tier older than this are pruned during sleep cycle. |
| `CORS_METHODS` | optional | `'GET,POST,OPTIONS'` | Restrict further if API is read-only for some clients |
| `CORS_HEADERS` | optional | `'Content-Type,Authorization'` | — |
| `RATE_LIMIT_MAX` | optional | `100` | Requests per window per IP on `/memory` routes. `0` disables. |
| `RATE_LIMIT_WINDOW_MS` | optional | `60000` | Rate limit window in milliseconds |
| `DB_POOL_MAX` | optional | `10` | Max PostgreSQL connections in pool |
| `DB_POOL_MIN` | optional | `2` | Min connections kept alive |
| `DB_POOL_IDLE_TIMEOUT_MS` | optional | `30000` | Idle connection timeout |
| `DB_POOL_CONNECTION_TIMEOUT_MS` | optional | `5000` | Connection acquisition timeout |
| `CONSOLIDATION_BATCH_SIZE` | optional | `500` | Max hot-tier rows per consolidation run |
| `CONSOLIDATION_THRESHOLD` | optional | `50` | Min hot-tier rows before auto-consolidation triggers |
| `AUTO_REGISTER_AGENTS` | optional | `'true'` | Set `'false'` to require explicit agent registration, preventing unknown agents from creating data |
| `SLEEP_CYCLE_TOKEN_BUDGET` | optional | `100000` | Max tokens per sleep cycle. Limits LLM cost exposure. |

**Generating strong random values:**

```bash
# AUDIT_HMAC_KEY and ADMIN_TOKEN
openssl rand -hex 32

# Or with Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

*`OAUTH2_REQUIRED` defaults to `true` — the `REQUIRED` constant is set by `process.env['OAUTH2_REQUIRED'] !== 'false'`, meaning you must explicitly opt out; the default is enforced.

---

## PostgreSQL Hardening

### Apply migrations in order

```bash
psql "$DATABASE_URL" -f schema/schema.sql          # fresh install only
psql "$DATABASE_URL" -f schema/migration-v1.2.sql
psql "$DATABASE_URL" -f schema/migration-v1.3.sql
psql "$DATABASE_URL" -f schema/migration-v1.4.sql
psql "$DATABASE_URL" -f schema/migration-v1.6.sql
psql "$DATABASE_URL" -f schema/migration-v2.0.sql
psql "$DATABASE_URL" -f schema/migration-v2.1.sql
psql "$DATABASE_URL" -f schema/migration-v2.2.sql  # audit chain + content hashes
psql "$DATABASE_URL" -f schema/migration-v2.7.sql  # halfvec (float16) vector storage (requires pgvector 0.5+)
```

`migration-v2.2.sql` creates the `audit_chain` and `cold_audit` tables and adds `content_hash` to `warm_tier`. Required for integrity verification.

### Create a dedicated application role

Do not run MemForge as a PostgreSQL superuser.

```sql
-- Run as superuser
CREATE ROLE memforge_app LOGIN PASSWORD 'CHANGE_ME';

GRANT CONNECT ON DATABASE memforge TO memforge_app;
GRANT USAGE ON SCHEMA public TO memforge_app;

-- Tables MemForge needs read/write on
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO memforge_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO memforge_app;

-- Prevent future tables from defaulting to no access
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO memforge_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO memforge_app;

-- Limit concurrent connections
ALTER ROLE memforge_app CONNECTION LIMIT 15;
```

Update `DATABASE_URL` to use this role:

```
DATABASE_URL=postgresql://memforge_app:CHANGE_ME@db-host:5432/memforge?sslmode=require
```

### Row-Level Security (defence-in-depth)

MemForge enforces tenant isolation at the application layer via `WHERE agent_id = $1`. RLS adds a database-level backstop. See THREAT_MODEL.md §4 for the threat this addresses.

```sql
-- Enable RLS on the primary data tables
ALTER TABLE warm_tier ENABLE ROW LEVEL SECURITY;
ALTER TABLE hot_tier ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_chain ENABLE ROW LEVEL SECURITY;

-- Policy: application sets the current agent via SET LOCAL
CREATE POLICY agent_isolation ON warm_tier
  USING (agent_id = current_setting('app.current_agent_id', true));

-- Repeat for each table above.

-- The application role must bypass RLS for admin operations (sleep cycle, consolidation)
-- that process multiple agents. Grant BYPASSRLS only if needed, otherwise keep the
-- policy and set app.current_agent_id per operation.
```

Note: Enabling RLS requires the application to call `SET LOCAL app.current_agent_id = $1` at the start of each request. This is not yet wired in MemForge — treat RLS as a recommended hardening step that requires code changes.

### Connection and statement limits

Set these in `postgresql.conf` or `ALTER SYSTEM`:

```sql
-- Prevent runaway queries from blocking the pool
ALTER SYSTEM SET statement_timeout = '30s';
ALTER SYSTEM SET idle_in_transaction_session_timeout = '60s';
ALTER SYSTEM SET lock_timeout = '10s';
SELECT pg_reload_conf();
```

You can also set per-role defaults:

```sql
ALTER ROLE memforge_app SET statement_timeout = '30s';
```

### TLS

Require TLS on all connections:

```
# postgresql.conf
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'

# pg_hba.conf — reject non-TLS connections from the app network
hostssl  memforge  memforge_app  10.0.0.0/8  scram-sha-256
```

In `DATABASE_URL`, add `?sslmode=require` (or `verify-full` with a trusted CA):

```
DATABASE_URL=postgresql://memforge_app:pw@db:5432/memforge?sslmode=require
```

### Monitoring

```bash
# Slow queries
SELECT query, calls, mean_exec_time FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 20;

# Pool exhaustion
SELECT count(*) FROM pg_stat_activity WHERE datname = 'memforge';

# Table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;
```

### Backup strategy

```bash
# Logical backup (recommended for restore flexibility)
pg_dump --no-acl --no-owner "$DATABASE_URL" | gzip > memforge-$(date +%Y%m%d).sql.gz

# Point-in-time recovery: enable WAL archiving in postgresql.conf
archive_mode = on
archive_command = 'cp %p /backup/wal/%f'
```

Test restores periodically. A backup that has never been tested is not a backup.

---

## Redis Hardening

### Authentication

```
# redis.conf
requirepass CHANGE_ME_STRONG_PASSWORD

# Bind to private interface only — never 0.0.0.0 in production
bind 127.0.0.1 10.0.1.5
protected-mode yes
```

Update `REDIS_URL`:

```
REDIS_URL=redis://:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:6379
```

### Memory and eviction

```
# redis.conf
maxmemory 512mb
maxmemory-policy allkeys-lru
```

Without `maxmemory`, Redis will consume all available RAM if the cache grows unbounded.

### Disable dangerous commands in production

```
# redis.conf
rename-command KEYS ""
rename-command DEBUG ""
rename-command CONFIG ""
rename-command SHUTDOWN SHUTDOWN_DO_NOT_USE
```

`KEYS` is O(N) over all keys and will block Redis under load. MemForge uses `SCAN` internally.

### TLS (if Redis is not on localhost)

```
# redis.conf
tls-port 6380
port 0
tls-cert-file /etc/ssl/redis/redis.crt
tls-key-file /etc/ssl/redis/redis.key
tls-ca-cert-file /etc/ssl/redis/ca.crt
```

### Security note on cached data

Redis stores plaintext query results including full memory content. See THREAT_MODEL.md §5. Key mitigations:

- Network isolation is the primary control: Redis must not be reachable from untrusted hosts.
- ACL-restrict the MemForge Redis user to only the key patterns it needs (`memforge:*`).
- The TTL caps exposure: hot-tier cache expires in 5 minutes, search results in 10 minutes, consolidation in 30 minutes.

```
# redis.conf — ACL (Redis 6+)
user memforge_cache on >CACHE_PASSWORD ~memforge:* &* +@read +@write +DEL +EXPIRE +TTL +SCAN
user default off
```

---

## Network Architecture

```
Internet / Agent clients
        │
        ▼
  [Reverse Proxy]          nginx or Caddy
  TLS termination          Port 443 only
  Rate limiting (outer)    complement app-level limits
  HSTS header              Strict-Transport-Security: max-age=31536000
        │
        ▼ HTTP (private network only)
  [MemForge API]           Port 3333, not publicly exposed
  OAuth2 validation        every /memory request
  App-level rate limit     100 req/min/IP on /memory
  Prometheus /metrics      admin-token-gated
        │
        ├──▶ [PostgreSQL]  private network, port 5432, TLS required
        ├──▶ [Redis]       localhost or private network, port 6379, AUTH required
        └──▶ [LLM Provider]
               Ollama:    localhost:11434 (preferred — no external traffic)
               Remote:    outbound HTTPS only, only if ALLOW_REMOTE_LLM=true
```

MemForge itself must **not** be directly reachable from the internet. All ingress goes through the reverse proxy. PostgreSQL and Redis must not have public IPs or public-facing firewall rules.

---

## HTTPS and TLS

### Reverse proxy termination (nginx example)

```nginx
server {
    listen 443 ssl http2;
    server_name memforge.example.com;

    ssl_certificate     /etc/ssl/certs/memforge.crt;
    ssl_certificate_key /etc/ssl/private/memforge.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache   shared:MEM:10m;
    ssl_stapling        on;
    ssl_stapling_verify on;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;

    location / {
        proxy_pass         http://127.0.0.1:3333;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }
}

server {
    listen 80;
    server_name memforge.example.com;
    return 301 https://$host$request_uri;
}
```

### Caddy (simpler, auto-HTTPS)

```
memforge.example.com {
    reverse_proxy localhost:3333
}
```

Caddy handles certificate provisioning, renewal, and HSTS automatically.

### Certificate rotation

Use Let's Encrypt with auto-renewal (certbot or Caddy). Verify renewal works before the certificate expires:

```bash
certbot renew --dry-run
```

---

## LLM Provider Security

This is the highest-severity risk in MemForge. See THREAT_MODEL.md §1 (data exfiltration) and §2 (prompt injection).

### Default: local only

```
ALLOW_REMOTE_LLM=false
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
```

With this configuration, memory content never leaves the machine during LLM processing. Ollama must be bound to localhost only.

### Sleep cycle: keep revision local even if main LLM is remote

```
LLM_PROVIDER=anthropic          # used for consolidation and reflection
REVISION_LLM_PROVIDER=ollama    # sleep cycle revision stays local
ALLOW_REMOTE_LLM=true           # required to enable remote providers
```

### If using remote providers

- Understand that memory content (including anything stored by agents) is sent to the provider.
- Review the provider's data processing agreement for your compliance requirements (GDPR, HIPAA, SOC2).
- Anthropic, OpenAI, and others may log API inputs for abuse monitoring. Check their data retention policies.
- Consider `CONSOLIDATION_MODE=concat` to avoid sending raw memories to remote LLMs during consolidation. Reflection and sleep cycle revision will still send content if enabled.
- `ALLOW_REMOTE_LLM=true` causes a warning to be logged on first use — check that warning is visible in your log aggregation.

### Prompt injection awareness

Memory content is user-supplied text injected directly into LLM prompts during consolidation, reflection, and sleep cycle. A malicious agent can craft content to hijack LLM behavior (see THREAT_MODEL.md §2). Mitigations are not yet implemented. Treat sleep cycle output (revised content, new procedures) as untrusted until output validation is in place.

---

## Monitoring and Alerting

### Prometheus metrics

The `/metrics` endpoint is gated by `ADMIN_TOKEN`. Scrape config:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: memforge
    static_configs:
      - targets: ['localhost:3333']
    bearer_token: YOUR_ADMIN_TOKEN
    metrics_path: /metrics
```

### Key metrics to alert on

| Metric | Alert condition | Meaning |
|---|---|---|
| `http_requests_total{status_code="5xx"}` | rate > 0.01/s | Server errors |
| `http_request_duration_seconds{quantile="0.99"}` | > 5s | Slow requests |
| `http_requests_total{route="/memory/:agentId/sleep"}` | rate > 1/min per agent | Potential sleep cycle DoS |
| PostgreSQL `pg_stat_activity count` | > DB_POOL_MAX | Pool exhaustion risk |
| Redis memory | > 80% of maxmemory | Cache eviction pressure |

### Request correlation

Every response includes `X-Request-Id`. Log aggregation should index this field to correlate MemForge logs with upstream proxy logs.

Structured JSON logs are emitted via pino. Example log aggregation (Loki, Datadog, CloudWatch Logs Insights) filter:

```
{ .level = "error" } | json | line_format "{{.requestId}} {{.msg}}"
```

### Audit chain verification

Run periodically to detect tampering:

```bash
# Verify all memories for an agent
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://memforge.example.com/memory/$AGENT_ID/verify" | jq .

# Automate as a cron job — alert if ok=false or broken_links > 0
*/30 * * * * /usr/local/bin/verify-memforge-audit.sh
```

### Health check

```bash
curl -sf https://memforge.example.com/health
# Returns: {"status":"ok","ts":"..."}
```

---

## Docker Hardening

The official `Dockerfile` already runs as non-root user `memforge` (uid 1001). Additional hardening for production:

### Resource limits

```yaml
# docker-compose.yml
services:
  memforge:
    image: memforge:1.2.3          # pin to a specific tag, never :latest
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
        reservations:
          memory: 128M
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:size=50m,mode=1777    # writable temp if needed
    environment:
      NODE_ENV: production
      DATABASE_URL: "${DATABASE_URL}"
      AUDIT_HMAC_KEY: "${AUDIT_HMAC_KEY}"
      ADMIN_TOKEN: "${ADMIN_TOKEN}"
      # ... other vars from secrets manager
```

### Do not mount unnecessary host paths

The only volume MemForge needs is none — it is stateless. All state lives in PostgreSQL and Redis. Do not mount `./schema` or source directories into the production container.

### Image pinning

Use a specific digest or semantic version tag:

```bash
# Build and tag with the git SHA
docker build -t memforge:$(git rev-parse --short HEAD) .
```

### Kubernetes pod security

```yaml
apiVersion: v1
kind: Pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1001
    runAsGroup: 1001
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: memforge
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: [ALL]
```

---

## Secrets Management

### Never commit secrets

`.env` files must never be committed. Verify:

```bash
# Add to .gitignore
echo ".env" >> .gitignore
echo ".env.*" >> .gitignore  # but keep .env.example committed

# Check for accidental secret commits
git log --all --full-history -- "**/*.env" "**/.env"
```

### Platform secret management

Inject secrets as environment variables at runtime, not at build time:

```bash
# Kubernetes Secrets
kubectl create secret generic memforge-secrets \
  --from-literal=AUDIT_HMAC_KEY=$(openssl rand -hex 32) \
  --from-literal=ADMIN_TOKEN=$(openssl rand -hex 32) \
  --from-literal=DATABASE_URL="postgresql://..."

# AWS Secrets Manager + ECS task definition
aws secretsmanager create-secret --name memforge/prod/audit-hmac-key \
  --secret-string "$(openssl rand -hex 32)"

# HashiCorp Vault
vault kv put secret/memforge/prod \
  AUDIT_HMAC_KEY=$(openssl rand -hex 32) \
  ADMIN_TOKEN=$(openssl rand -hex 32)
```

### Rotation schedule

| Secret | Rotation frequency | Notes |
|---|---|---|
| `AUDIT_HMAC_KEY` | Annually or on suspected compromise | Changing this invalidates all existing audit chain hashes — plan for a re-hash migration |
| `ADMIN_TOKEN` | Every 90 days | No state attached — rotate freely |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Every 90 days or on personnel change | Check provider dashboards for usage anomalies before rotating |
| Database password | Every 90 days | Coordinate with connection pool drain |
| Redis password | Every 90 days | MemForge reconnects automatically on next cache miss |
| OAuth2 client secret | Per OAuth2 server policy | Coordinate with token issuer |

### Minimum database privileges

The `memforge_app` role must not have `SUPERUSER`, `CREATEDB`, `CREATEROLE`, or `REPLICATION`. It does not need access to the `postgres` database or system catalogs beyond the defaults.

---

## Production Checklist

Copy and check off before going live:

- [ ] `NODE_ENV=production`
- [ ] `AUDIT_HMAC_KEY` set to a strong random value (≥ 32 bytes of entropy, hex-encoded)
- [ ] `ADMIN_TOKEN` set to a strong random value
- [ ] `OAUTH2_REQUIRED=true` (or not set — default is enforced) with a valid `OAUTH2_INTROSPECT_URL`
- [ ] `CORS_ORIGIN` set to specific allowed origins, never `*`
- [ ] `ALLOW_REMOTE_LLM=false` (or consciously set to `true` after reviewing THREAT_MODEL.md §1)
- [ ] `DATABASE_URL` includes `?sslmode=require` (or `verify-full`)
- [ ] `REDIS_URL` includes AUTH password: `redis://:password@host:6379`
- [ ] `migration-v2.2.sql` applied (audit chain tables and `content_hash` column)
- [ ] `migration-v2.3.sql` applied (RLS policies, audit delete trigger, statement timeout)
- [ ] `migration-v2.7.sql` applied (halfvec float16 vector storage — requires pgvector 0.5+)
- [ ] Reverse proxy with TLS termination in front of MemForge (nginx or Caddy)
- [ ] MemForge port (3333) not exposed on public network interface
- [ ] PostgreSQL not reachable from public network; TLS enabled; dedicated app role created
- [ ] Redis not reachable from public network; `requirepass` set; `bind` to private interface
- [ ] Container/process resource limits configured (`--memory`, `--cpus` or cgroup equivalents)
- [ ] Container runs as non-root (uid 1001 — already set in official Dockerfile)
- [ ] Specific image tag pinned (not `:latest`)
- [ ] `AUTO_REGISTER_AGENTS=false` if you want to control which agents can create data
- [ ] Log aggregation configured and indexing `X-Request-Id`
- [ ] Prometheus scrape configured with `ADMIN_TOKEN`
- [ ] Alerting rules set for error rate and pool exhaustion
- [ ] Audit chain verification scheduled (cron or external monitor)
- [ ] Backup strategy documented, automated, and restore tested
- [ ] `.env` files excluded from version control (`.gitignore`)
- [ ] Secrets stored in platform secret manager, not in deployment configs
- [ ] Secret rotation schedule documented and owners assigned
