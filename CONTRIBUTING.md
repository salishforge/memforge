# Contributing to MemForge

Thank you for your interest in contributing to MemForge. This document explains how to get started, what we look for in contributions, and how the project is organized.

## Getting Started

### Prerequisites

- Node.js >= 20
- PostgreSQL 16+ with `pgvector` and `pg_trgm` extensions
- Redis 7+ (optional for development)
- Git

### Development Setup

```bash
git clone https://github.com/salishforge/memforge.git
cd memforge
npm install
cp .env.example .env
# Edit .env — set DATABASE_URL at minimum

# Apply schema to your development database
psql "$DATABASE_URL" -f schema/schema.sql

# Type-check
npm run type-check

# Run in development mode (auto-reload)
npm run dev
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed setup, architecture overview, and testing guide.

## How to Contribute

### Reporting Bugs

Open a [GitHub issue](https://github.com/salishforge/memforge/issues/new?template=bug_report.md) with:
- Steps to reproduce
- Expected vs actual behavior
- Your environment (Node version, OS, PostgreSQL version)
- Relevant log output

### Suggesting Features

Open a [GitHub issue](https://github.com/salishforge/memforge/issues/new?template=feature_request.md) with:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

### Pull Requests

1. **Fork** the repository and create a branch from `main`
2. **Write code** that follows the existing patterns (see Code Style below)
3. **Add tests** for new functionality — see DEVELOPMENT.md for testing guidance
4. **Run checks**: `npm run type-check && npm run lint` must pass with zero errors
5. **Write a clear PR description** explaining what and why
6. **Keep PRs focused** — one feature or fix per PR

### Code Style

- **TypeScript strict mode** — no `any` types, no unchecked index access
- **Explicit error handling** — catch specific errors, don't swallow them
- **Parameterized SQL** — never interpolate user input into queries
- **Functional decomposition** — each method does one thing
- **No premature abstraction** — concrete code over generic helpers
- **Comments explain why**, not what — the code should be readable without comments

### Commit Messages

Follow conventional commits:

```
feat(sleep-cycle): add entity deduplication to Phase 4
fix(query): handle empty FTS results with trigram fallback
docs(readme): add MCP integration section
test(feedback): add integration tests for outcome recording
chore(deps): bump express to 4.21.3
```

## Architecture Decisions

MemForge makes deliberate architectural choices. Please read [ARCHITECTURE.md](ARCHITECTURE.md) and [SPECIFICATION.md](SPECIFICATION.md) before proposing changes to core systems.

Key decisions to be aware of:
- **Pure PostgreSQL** — no Neo4j, no separate graph database. All graph operations use recursive CTEs.
- **No external MCP SDK** — the MCP server implements the protocol directly for minimal dependencies.
- **No built-in scheduler** — sleep cycles are triggered externally by design.
- **Pluggable providers** — LLM and embedding providers are interfaces, not concrete implementations.

### Good First Issues

Issues labeled [`good first issue`](https://github.com/salishforge/memforge/issues?q=is%3Aopen+label%3A%22good+first+issue%22) are scoped, well-documented, and don't require deep knowledge of the codebase. Start there.

### Areas Where We Especially Welcome Contributions

- **Documentation** — integration guides for LangChain, AutoGen, CrewAI (#21), ADRs (#22), deployment security guide (#46)
- **New embedding/LLM providers** — Cohere, Mistral, Gemini, local models
- **Performance** — streaming consolidation (#11), BM25 search (#23)
- **Features** — memory namespaces (#16), cold tier querying (#14), CORS config (#18)
- **Security hardening** — cache validation (#41), classifier improvements (#45), rate limiting (#43)
- **Bug fixes** — especially edge cases in consolidation and sleep cycles

### Areas Where We're More Conservative

- **Core data model changes** — schema changes affect all downstream consumers
- **New dependencies** — we aim for a minimal dependency surface
- **Breaking API changes** — existing MCP tools and SDK consumers depend on stability

## Development Workflow

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make changes, run `npm run type-check` frequently
3. Test against a real database where possible
4. Push and open a PR against `main`
5. Address review feedback
6. Squash-merge once approved

## License

By contributing to MemForge, you agree that your contributions will be licensed under the MIT License.
