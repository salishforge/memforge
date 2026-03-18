# MemForge

Neuroscience-inspired memory consolidation service for AI agents.

MemForge manages agent memory across three tiers:
- **Hot**: Recent events, unprocessed
- **Warm**: Consolidated, searchable, semantic  
- **Cold**: Archived, rare access

## Quick Start

```bash
npm install
npm run build
npm start
```

## API

- `POST /memory/{agentId}/add` — Add event
- `GET /memory/{agentId}/query?q=search` — Search memory
- `POST /memory/{agentId}/consolidate` — Trigger consolidation
- `GET /health` — Health check

## Database

PostgreSQL with hot_tier, warm_tier, cold_tier tables. See schema/schema.sql.

## Multi-Tenant

Each agent has isolated memory. Queries filtered by agent_id.

## License

MIT
