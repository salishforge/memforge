# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 2.1.x   | Yes                |
| 2.0.x   | Security fixes only|
| < 2.0   | No                 |

## Reporting a Vulnerability

If you discover a security vulnerability in MemForge, please report it responsibly.

**Do not open a public issue.** Instead:

1. [Open a private security advisory](https://github.com/salishforge/memforge/security/advisories/new) on GitHub with details of the vulnerability
2. Include steps to reproduce, potential impact, and suggested fix if you have one
3. Allow up to 72 hours for an initial response

We will:
- Acknowledge receipt within 72 hours
- Provide an estimated timeline for a fix
- Credit you in the security advisory (unless you prefer anonymity)
- Release a patch and advisory once the fix is ready

## Security Architecture

### Authentication

- All `/memory/*` endpoints require Bearer token authentication (`MEMFORGE_TOKEN`)
- Admin endpoints (`/admin/*`) use a separate `ADMIN_TOKEN`
- Token comparison uses `crypto.timingSafeEqual` to prevent timing attacks
- Token validation results are cached for 30 seconds to reduce overhead

### Authorization

- Scope-based authorization: `memforge:read` for GET operations, `memforge:write` for POST operations
- Multi-tenant isolation: all queries include `agent_id` predicates — Agent A cannot access Agent B's data

### Input Validation

- Agent IDs are validated against a strict pattern: `^[\w.@:=-]{1,256}$`
- All user-supplied SQL parameters use parameterized queries (no string interpolation)
- Request bodies are validated for required fields, types, and range constraints
- Rate limiting is applied to all `/memory` routes (configurable via `RATE_LIMIT_MAX`)

### XSS Prevention

- The Swagger UI helper uses explicit HTML entity escaping (`escapeHtml`)
- JavaScript string literals in rendered HTML use `escapeJsString` with `<` → `\x3c` encoding
- The cache dashboard uses DOM API manipulation instead of `innerHTML`

### Data Handling

- No PII-specific handling is built in — MemForge stores whatever content you send it
- Cold tier provides an audit trail but does not implement hard deletion
- Database connections use connection pooling with configurable limits

### Dependencies

- Minimal dependency surface: Express, pg, redis, prom-client, express-rate-limit
- No external SDK dependencies for LLM providers — direct HTTP calls to APIs
- MCP server uses no external MCP SDK — minimal protocol implementation

### Known Security Considerations

1. **LLM Prompt Injection**: Memory content is passed to LLMs during consolidation, reflection, and revision. Malicious content stored as memories could influence LLM behavior. Mitigation: system prompts are hardcoded and instruct the LLM to only work with provided content.

2. **Bearer Token Storage**: Tokens are stored in environment variables. In production, use a secrets manager rather than `.env` files.

3. **Redis Cache**: Cached responses are stored in plaintext in Redis. If Redis is accessible to untrusted parties, sensitive memory content could be exposed. Use Redis ACLs and network isolation in production.

4. **Database**: Memory content is stored in plaintext in PostgreSQL. Use PostgreSQL's built-in encryption features (pgcrypto) or disk-level encryption for sensitive deployments.

5. **No HTTPS**: The server runs plain HTTP. Deploy behind a reverse proxy (nginx, Caddy) with TLS termination in production.

## Hardening Checklist for Production

- [ ] Set strong, unique values for `MEMFORGE_TOKEN` and `ADMIN_TOKEN`
- [ ] Run behind a TLS-terminating reverse proxy
- [ ] Restrict Redis access with ACLs and network policies
- [ ] Use PostgreSQL SSL mode (`?sslmode=require` in DATABASE_URL)
- [ ] Set `RATE_LIMIT_MAX` appropriate to your workload
- [ ] Disable `AUTO_REGISTER_AGENTS` if agents should be explicitly provisioned
- [ ] Review and restrict CORS if exposing to browser clients
- [ ] Monitor `/metrics` endpoint for anomalous request patterns
- [ ] Rotate tokens periodically
- [ ] Back up the database — cold tier archival is not a backup strategy
