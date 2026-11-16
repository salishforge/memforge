# Security Policy

## Status: unsupported

MemForge was deprecated on 2026-11-16 and is no longer maintained. **No version receives security fixes**, and no patched release will be published.

| Version | Supported |
|---------|-----------|
| All     | No        |

## Reporting a Vulnerability

There is no security support. If you want other users warned about a vulnerability, you can still [open a private security advisory](https://github.com/salishforge/memforge/security/advisories/new). It may be published as a warning, but no fix will follow. Please do not open a public issue.

## Known unfixed limitations

These are not going to be fixed. If you still run MemForge, plan around them and migrate:

- **No authentication unless you configure it.** If neither `MEMFORGE_TOKEN` nor OAuth2 is set, every `/memory/*` route accepts unauthenticated requests. The standalone image does not set a token, and the shipped Docker Compose file does not pass `MEMFORGE_TOKEN` through from `.env`; add it to the `memforge` service's `environment:` block yourself.
- **A token is not bound to an agent.** Any caller with a valid token can read and write every agent's memory. Treat everyone who holds the token as one trust domain.
- **PostgreSQL row-level security is not enforced on the application's own database connection.** Isolation between agents rests on query predicates only.
- **Audit-chain verification is unreliable.** It can report tampering on healthy data, and concurrent writers can fork the chain.
- **The PyPI name `memforge` belongs to an unrelated project.** Never run `pip install memforge`.

The sections below describe the design as documented while the project was maintained. Where they conflict with this list, this list is correct.

## Security Architecture

### Authentication

- `/memory/*` endpoints require Bearer token authentication only when `MEMFORGE_TOKEN` or OAuth2 is configured (see Known unfixed limitations)
- Admin endpoints (`/admin/*`) use a separate `ADMIN_TOKEN`
- Token comparison uses `crypto.timingSafeEqual` to prevent timing attacks
- Token validation results are cached for 30 seconds to reduce overhead

### Authorization

- Scope-based authorization: `memforge:read` for GET operations, `memforge:write` for POST operations
- Agent scoping: all queries include `agent_id` predicates, but the caller chooses the `agent_id`, so this is not isolation between callers (see Known unfixed limitations)

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
