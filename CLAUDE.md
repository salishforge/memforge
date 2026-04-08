# MemForge — Project Instructions for AI Agents

This file provides context for AI agents (Claude Code, Cursor, etc.) working on this codebase.

## What This Project Is

MemForge is a neuroscience-inspired memory system for AI agents. It provides tiered memory storage (hot → warm → cold), hybrid search, a knowledge graph, LLM-driven reflection, sleep cycles that actively revise and improve stored knowledge, and procedural learning.

**Key design documents:**
- [INTEGRATION.md](INTEGRATION.md) — How to wire MemForge into any agent (REST, SDK, MCP, LangChain, CrewAI, etc.)
- [SPECIFICATION.md](SPECIFICATION.md) — Design philosophy, objectives, and core tenets
- [ARCHITECTURE.md](ARCHITECTURE.md) — Internal architecture, data models, module structure
- [DEVELOPMENT.md](DEVELOPMENT.md) — Setup, testing, extension points
- [CHANGELOG.md](CHANGELOG.md) — Version history

## Tech Stack

- **Language**: TypeScript 5.7, strict mode, ES modules (NodeNext)
- **Runtime**: Node.js 22+
- **Database**: PostgreSQL 16 with `pgvector` and `pg_trgm` extensions
- **Cache**: Redis 7 (optional — graceful degradation)
- **Framework**: Express 4
- **No ORM** — raw SQL with parameterized queries via `pg`

## Build & Check Commands

```bash
npm run type-check     # TypeScript strict mode check (must pass with 0 errors)
npm run build          # Compile to dist/
npm run dev            # Watch mode with tsx
npm start              # Run compiled server
npm test               # All tests (requires Postgres + Redis)
npm run test:integration  # Integration tests only (requires Postgres)
npm run test:cache     # Cache tests only (requires Redis)
```

## Code Conventions

- **All SQL uses parameterized queries** — never interpolate user input
- **All operations scoped by agentId** — multi-tenant isolation is mandatory
- **Types are in `src/types.ts`** — shared interfaces, no inline type definitions
- **No `any` types** — `noUncheckedIndexedAccess` is enabled
- **Error handling**: catch specific errors, return typed error responses with `{ ok: false, error: "..." }`
- **Success responses**: always `{ ok: true, data: ... }`
- **Fire-and-forget**: async operations that don't affect the response use `void promise.catch(...)` pattern
- **Imports**: use `.js` extensions for local imports (ESM requirement)

## Architecture Rules

- **Pure PostgreSQL** — no Neo4j or separate graph database. Knowledge graph uses recursive CTEs.
- **No external MCP SDK** — the MCP server implements the protocol directly (minimal dependencies).
- **No built-in scheduler** — sleep cycles are triggered externally by design.
- **Pluggable providers** — LLM and embedding providers are interfaces in `llm.ts` and `embedding.ts`.
- **No premature abstraction** — concrete implementations over generic helpers.

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/memory-manager.ts` | ~1,840 | Core API — all memory operations |
| `src/app.ts` | ~875 | Express app factory (testable, no side effects) |
| `src/sleep-cycle.ts` | ~555 | Sleep cycle engine (5 phases) |
| `src/server.ts` | ~112 | Thin bootstrap — creates providers, calls createApp() |
| `src/llm.ts` | ~325 | LLM providers + system prompts |
| `src/types.ts` | ~360 | All TypeScript interfaces |
| `src/client.ts` | ~360 | HTTP client SDK |
| `src/mcp.ts` | ~440 | MCP server (17 tools) |
| `src/logger.ts` | ~72 | Structured logging (pino) + request correlation IDs |
| `schema/schema.sql` | ~230 | Complete database schema (12 tables) |

## When Adding New Features

1. Add types to `src/types.ts`
2. Add the core method to `MemoryManager` in `src/memory-manager.ts`
3. Add the REST endpoint to `src/server.ts`
4. Add the client method to `src/client.ts`
5. Add the MCP tool to `src/mcp.ts` (both definition and executor)
6. Add the tool definition to `src/tool-definitions.ts`
7. Add the OpenAPI spec entry to `src/openapi.ts`
8. Add a database migration if needed in `schema/migration-*.sql`
9. Add tests to `tests/integration.test.ts`
10. Run `npm run type-check` — must pass with 0 errors

## When Modifying the Schema

- Never modify `schema/schema.sql` for existing columns — create a new `schema/migration-v*.sql`
- `schema/schema.sql` is the canonical "from scratch" schema — keep it in sync with migrations
- All tables have `agent_id` columns with foreign key to `agents` table
- Use `CASCADE` on foreign keys where appropriate

## Testing

- Tests use Node.js built-in `node:test` runner — no Jest, no Vitest
- Integration tests require a real PostgreSQL database with schema applied
- Cache tests require Redis at localhost:6379
- Tests clean up after themselves — each describe block has before/after cleanup
- Run `npm run type-check` before running tests — type errors will cause confusing failures

## Model Routing Strategy

When spawning subagents with the Agent tool, select the model tier based on task impact:

| Model | Use For |
|-------|---------|
| **Opus 4.6** (`model: "opus"`) | Planning, architecture, security reviews, audit, integration design, complex multi-file coding |
| **Sonnet 4.6** (`model: "sonnet"`) | Documentation, moderate coding, code review, test writing, refactoring |
| **Haiku 4.5** (`model: "haiku"`) | Quick lookups, simple file searches, boilerplate generation, formatting |
| **gemma4:31b-cloud** (via `ollama run`) | Parallel routine coding where output is easy to verify: scaffolding, repetitive transforms, bulk edits, simple implementations |

**Principles:**
- Use Claude models when output quality affects production results. Use gemma4 via Ollama CLI to preserve Anthropic API quota on commodity tasks.
- Don't use Opus for tasks Sonnet handles well. Don't use Sonnet for tasks Haiku or gemma4 handles well.
- Ollama models are invoked via shell (`ollama run gemma4:31b-cloud "prompt"`) — Claude Code does not support routing subagents to non-Anthropic providers.
- Ollama API key is in `~/.claude/ollama.env`.

## Known Limitations & Open Issues

See GitHub issues for the current backlog. Key areas:

- **No unit tests for LLM-dependent paths** — consolidation (summarize mode), reflection, sleep cycle revision, and meta-reflection all require LLM calls. Need mocked LLM provider tests.
- **No CI/CD pipeline** — needs GitHub Actions for type-check, lint, test
- **Single-process** — no clustering, no worker threads for sleep cycles
- **No streaming** — large consolidation batches load all hot-tier rows into memory
- **No hard deletion** — cold tier accumulates indefinitely
