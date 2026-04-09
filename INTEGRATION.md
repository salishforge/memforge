# Integrating MemForge with AI Agents

This guide explains how to wire MemForge into any AI agent, regardless of framework. It covers the conceptual model, the integration points, and concrete examples for common setups.

## Graceful Degradation

MemForge should never crash your agent. If MemForge is down, the agent should keep working — just without long-term memory for that interaction.

The SDK ships two clients:

- **`MemForgeClient`** — Throws on errors. Use when you want explicit error handling.
- **`ResilientMemForgeClient`** — Catches all errors, returns safe defaults (empty arrays, null). Use when MemForge is optional. **This is the recommended client for production agents.**

```typescript
import { ResilientMemForgeClient } from '@salishforge/memforge/client';

const memory = new ResilientMemForgeClient({
  baseUrl: 'http://localhost:3333',
  token: process.env.MEMFORGE_TOKEN,
});

// If MemForge is down, returns [] instead of throwing
const results = await memory.query('agent-1', { q: 'user preferences' });

// If MemForge is down, returns { memories: [], procedures: [] }
const context = await memory.activeRecall('agent-1', 'deploying v2.4');

// If MemForge is down, silently drops the store — logs a warning
await memory.add('agent-1', 'User requested dark mode');
```

Errors are logged to console by default. You can provide a custom error handler:

```typescript
const memory = new ResilientMemForgeClient(
  { baseUrl: 'http://localhost:3333' },
  (method, err) => myLogger.warn(`MemForge ${method} unavailable: ${err.message}`),
);
```

## The Core Pattern

MemForge fits into any agent's lifecycle at four points:

```
┌─────────────────────────────────────────────────────────┐
│                    AGENT INTERACTION                     │
│                                                         │
│  1. RECALL  ──→  Query memory before acting             │
│  2. ACT     ──→  Agent does its work                    │
│  3. STORE   ──→  Record what happened                   │
│  4. SLEEP   ──→  Consolidate and improve (when idle)    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

That's it. Every integration follows this pattern. The specifics vary by framework, but the pattern is universal.

### Step 1: Recall (before the agent acts)

Before your agent processes a user request, check memory for relevant context:

```typescript
// "What do I already know that's relevant?"
const memories = await client.query(agentId, {
  q: userMessage,
  mode: 'hybrid',
  limit: 5,
});

// "Are there learned rules I should follow?"
const procedures = await client.getProcedures(agentId, userMessage);

// Or use active recall for both at once:
const context = await client.activeRecall(agentId, userMessage);
```

Inject the results into the agent's system prompt or context window.

### Step 2: Act (agent does its work)

This is your agent's normal operation. MemForge doesn't interfere here — it just provided context in Step 1.

### Step 3: Store (after the agent acts)

Record what happened so the agent can learn from it:

```typescript
// Store the interaction
await client.add(agentId, `User asked: ${userMessage}\nAgent responded: ${response}`);

// Optionally pass hints to bias future retrieval for this content
await client.add(agentId, 'User prefers dark mode', {
  hints: { keywords: ['dark mode', 'ui preferences'], entities: ['User'] },
});

// If you know the outcome was good or bad, record feedback with structured tags
// (retrievalIds come from Step 1's query results)
await client.feedback(agentId, retrievalIds, 'positive', ['task_completed']);
```

### Step 4: Sleep (when the agent is idle)

Periodically — not on every interaction — trigger consolidation and sleep cycles:

```typescript
// Consolidate raw events into searchable memory
await client.consolidate(agentId, 'summarize');

// Run a sleep cycle to score, revise, and reflect
await client.sleep(agentId, { tokenBudget: 50000 });
```

This can be triggered by a cron job, an idle timer, or manually. See the [Scheduling Sleep Cycles](README.md#scheduling-sleep-cycles) section in the README.

---

## Active Ingest

Starting in v2.2.0, agents can participate directly in their own memory management rather than being passive content producers. Active ingest has four mechanisms:

### 1. Hints API

Submit retrieval hints that bias future search scoring for an agent — without writing a memory:

```typescript
// REST
curl -X POST http://localhost:3333/memory/agent-1/hints \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["authentication", "OAuth2", "JWT"],
    "entities": ["AuthService", "User"],
    "temporalAnchor": "2026-04-08T00:00:00Z"
  }'

// TypeScript SDK
await client.hints(agentId, {
  keywords: ['authentication', 'OAuth2'],
  entities: ['AuthService'],
});
```

Hints persist for the duration of the next sleep cycle and are incorporated into importance scoring. Use them when you know what's relevant but don't want to store a full memory event.

### 2. Preference Extraction

When `ENABLE_LLM_INGEST=true`, consolidation automatically extracts user preferences from stored content and tags them for priority retrieval. No code changes needed — enable the feature flag and preferences are detected and weighted automatically.

### 3. Supersession

Mark a prior memory as superseded when storing a newer version:

```typescript
await client.add(agentId, 'User now prefers light mode (changed from dark mode)', {
  supersedesId: previousMemoryId,
});
```

The superseded memory's confidence decays and its graph edges are invalidated during the next sleep cycle. Useful when an agent knows an earlier fact is now stale.

### 4. Entity Detection at Ingest

When `ENABLE_LLM_INGEST=true`, named entities are extracted from content at write time and linked to the knowledge graph immediately, without waiting for consolidation. Useful for time-sensitive graph queries.

---

## Agent Resumption

When an agent loses its context window (conversation reset, restart, or failover), the resume endpoint provides a compact context bundle for fast warm-start:

```bash
GET /memory/:agentId/resume
```

Returns:
- **recent** — Last 5 warm-tier memories (most recent first)
- **entities** — Top active entities from the knowledge graph
- **procedures** — All active condition→action rules
- **latestReflection** — Most recent reflection, if any

```typescript
// TypeScript SDK
const ctx = await client.resume(agentId);

// Inject into new system prompt
const systemPrompt = `
You are resuming after a context reset.

Recent memories:
${ctx.recent.map(m => m.content).join('\n')}

Active entities: ${ctx.entities.map(e => e.name).join(', ')}

Learned rules:
${ctx.procedures.map(p => `- When ${p.condition}: ${p.action}`).join('\n')}
`;
```

```python
# Python / REST
r = httpx.get(
    f"{MEMFORGE_URL}/memory/{AGENT_ID}/resume",
    headers=headers,
    timeout=5.0,
)
ctx = r.json()["data"]
recent_memories = [m["content"] for m in ctx["recent"]]
```

---

## Docker Standalone Quickstart

The fastest way to run MemForge locally — no separate PostgreSQL or Redis required:

```bash
docker run -p 3333:3333 salishforge/memforge:standalone
```

The standalone image bundles an embedded PostgreSQL instance. It is intended for local development and evaluation. For production, use Docker Compose (`docker compose up -d`) which provides a proper PostgreSQL container and optional Redis.

---

## Three Ways to Connect

### Option A: HTTP REST API (works with anything)

MemForge runs as a standalone HTTP server. Any language, any framework — if it can make HTTP requests, it can use MemForge.

```bash
# Start MemForge
docker compose up -d
# or: npm start

# Store a memory
curl -X POST http://localhost:3333/memory/my-agent/add \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "User prefers dark mode"}'

# Query memory
curl "http://localhost:3333/memory/my-agent/query?q=user+preferences" \
  -H "Authorization: Bearer $MEMFORGE_TOKEN"
```

**Use when:** Your agent is in Python, Go, Rust, or any non-TypeScript environment. Or when you want language-agnostic access.

### Option B: TypeScript SDK (Node.js / Deno / Bun)

Zero-dependency HTTP client with full type safety:

```typescript
import { MemForgeClient } from '@salishforge/memforge/client';

const memory = new MemForgeClient({
  baseUrl: 'http://localhost:3333',
  token: process.env.MEMFORGE_TOKEN,
});

await memory.add('my-agent', 'User prefers dark mode');
const results = await memory.query('my-agent', { q: 'user preferences' });

// v2.2.0 additions
await memory.hints('my-agent', { keywords: ['dark mode'], entities: ['User'] });
const ctx = await memory.resume('my-agent');
await memory.feedback('my-agent', [id], 'positive', ['task_completed']);
```

**Use when:** Your agent is TypeScript/JavaScript and you want type-safe access.

**Full client method list (v2.6.0):**

| Method | Description |
|--------|-------------|
| `add(agentId, content, opts?)` | Store a memory event. `opts.hints`, `opts.supersedesId` supported. |
| `query(agentId, params)` | Search warm-tier memory |
| `consolidate(agentId, mode?)` | Trigger hot→warm consolidation |
| `timeline(agentId, params?)` | Retrieve memories chronologically |
| `stats(agentId)` | Tier statistics |
| `clear(agentId)` | Archive to cold tier |
| `sleep(agentId, opts?)` | Run a full sleep cycle |
| `health(agentId)` | Memory health metrics (includes `stale_memory_count`, `knowledge_gap_count_7d`) |
| `reflect(agentId)` | Trigger LLM reflection |
| `reflections(agentId)` | List stored reflections |
| `metaReflect(agentId)` | Second-order reflection |
| `procedures(agentId)` | List learned condition→action rules |
| `entities(agentId, params?)` | Search knowledge graph entities |
| `graph(agentId, entity)` | Traverse graph from an entity |
| `deduplicateEntities(agentId)` | Merge duplicate entities |
| `feedback(agentId, ids, outcome, tags?)` | Record retrieval outcome feedback |
| `activeRecall(agentId, context)` | Proactively surface relevant memories |
| `hints(agentId, hints)` | Submit retrieval hints (v2.2.0) |
| `resume(agentId)` | Get warm-start context bundle (v2.2.0) |
| `export(agentId)` | Export all memories as JSONL (v2.6.0) |
| `import(agentId, jsonl)` | Bulk import memories from JSONL (v2.6.0) |
| `conflicts(agentId)` | List detected memory conflicts (v2.6.0) |

### Option C: MCP Tools (Claude Code, Cursor, MCP-compatible tools)

MemForge ships as an MCP server with 17 tools. AI assistants call the tools directly — no code needed from you.

```json
// Add to ~/.claude/settings.json or .mcp.json
{
  "mcpServers": {
    "memforge": {
      "command": "npx",
      "args": ["memforge-mcp"],
      "env": {
        "MEMFORGE_URL": "http://localhost:3333",
        "MEMFORGE_TOKEN": "your-token"
      }
    }
  }
}
```

The AI assistant then has access to tools like `memforge_add`, `memforge_query`, `memforge_reflect`, `memforge_sleep`, etc. It decides when to use them based on conversation context.

**Use when:** Your "agent" is Claude Code, Cursor, or another MCP-compatible AI tool.

### Option D: Python SDK

```bash
pip install memforge
```

Three classes cover different use cases:

#### `MemForgeClient` — direct, typed, raises on errors

```python
import asyncio
from memforge import MemForgeClient

async def main():
    client = MemForgeClient(base_url="http://localhost:3333", token="your-token")

    # Store a memory
    await client.add("agent-1", "User prefers dark mode")

    # Search
    results = await client.query("agent-1", q="user preferences", mode="hybrid")
    for m in results:
        print(m["content"])

    # Consolidate and sleep
    await client.consolidate("agent-1")
    await client.sleep("agent-1", token_budget=50000)

    # Feedback loop
    retrieval_ids = [r["id"] for r in results]
    await client.feedback("agent-1", retrieval_ids, "positive", ["task_completed"])

    # Export / import
    jsonl = await client.export("agent-1")           # returns JSONL string
    await client.import_memories("agent-1", jsonl)   # bulk load

asyncio.run(main())
```

#### `ResilientMemForgeClient` — graceful degradation (recommended for production)

```python
from memforge import ResilientMemForgeClient

# Never raises — returns safe defaults if MemForge is unavailable
client = ResilientMemForgeClient(
    base_url="http://localhost:3333",
    token="your-token",
    on_error=lambda method, err: logger.warning(f"MemForge {method}: {err}"),
)

# Returns [] if MemForge is down
results = await client.query("agent-1", q="preferences")

# Silently drops if MemForge is down
await client.add("agent-1", "User likes compact layouts")
```

#### `ConversationMemory` — chat-oriented adapter

```python
from memforge import ResilientMemForgeClient, ConversationMemory

client = ResilientMemForgeClient(base_url="http://localhost:3333", token="your-token")
memory = ConversationMemory(client, agent_id="agent-1")

# Session management
session_id = await memory.start_session()

# Record turns
await memory.add_turn("user", "I prefer dark mode")
await memory.add_turn("assistant", "Noted! I'll use dark mode for you.")

# Retrieve context before responding
context_memories = await memory.get_context("display preferences")

# End session (triggers consolidation)
await memory.end_session(session_id)
```

**Full Python SDK method list:**

| Method | Description |
|--------|-------------|
| `add(agent_id, content, **opts)` | Store a memory event. Supports `hints`, `supersedes_id`. |
| `query(agent_id, q, **params)` | Search warm-tier memory |
| `consolidate(agent_id, mode?)` | Trigger hot→warm consolidation |
| `timeline(agent_id, **params)` | Retrieve memories chronologically |
| `stats(agent_id)` | Tier statistics |
| `clear(agent_id)` | Archive to cold tier |
| `sleep(agent_id, **opts)` | Run a full sleep cycle |
| `health(agent_id)` | Memory health metrics (includes `stale_memory_count`, `knowledge_gap_count_7d`) |
| `reflect(agent_id)` | Trigger LLM reflection |
| `reflections(agent_id)` | List stored reflections |
| `meta_reflect(agent_id)` | Second-order reflection |
| `procedures(agent_id)` | List learned condition→action rules |
| `entities(agent_id, **params)` | Search knowledge graph entities |
| `graph(agent_id, entity)` | Traverse graph from an entity |
| `deduplicate_entities(agent_id)` | Merge duplicate entities |
| `feedback(agent_id, ids, outcome, tags?)` | Record retrieval outcome feedback |
| `active_recall(agent_id, context)` | Proactively surface relevant memories |
| `hints(agent_id, hints)` | Submit retrieval hints |
| `resume(agent_id)` | Get warm-start context bundle |
| `export(agent_id)` | Export all memories as JSONL |
| `import_memories(agent_id, jsonl)` | Bulk import memories from JSONL |
| `conflicts(agent_id)` | List detected memory conflicts |

**Use when:** Your agent is Python and you want a typed, async-native client.

---

## Framework-Specific Examples

### Custom Agent Loop (no framework)

The simplest integration — a while loop that processes messages:

```typescript
import { ResilientMemForgeClient } from '@salishforge/memforge/client';

// ResilientMemForgeClient never throws — agent keeps running if MemForge is down
const memory = new ResilientMemForgeClient();
const agentId = 'my-assistant';
let interactionCount = 0;

async function handleMessage(userMessage: string): Promise<string> {
  // 1. RECALL
  const context = await memory.activeRecall(agentId, userMessage);
  const memoryContext = context.memories.map(m => m.content).join('\n');
  const rules = context.procedures.map(p => `- When ${p.condition}: ${p.action}`).join('\n');

  // 2. ACT — call your LLM with memory context
  const response = await callLLM({
    system: `You are a helpful assistant.\n\nRelevant memories:\n${memoryContext}\n\nLearned rules:\n${rules}`,
    user: userMessage,
  });

  // 3. STORE
  await memory.add(agentId, `User: ${userMessage}\nAssistant: ${response}`);
  interactionCount++;

  // 4. SLEEP — consolidate every 20 interactions
  if (interactionCount % 20 === 0) {
    await memory.consolidate(agentId, 'summarize');
  }

  return response;
}

// Run sleep cycle on shutdown or idle
process.on('SIGTERM', async () => {
  await memory.consolidate(agentId, 'summarize');
  await memory.sleep(agentId);
});
```

### LangChain / LangGraph (Python)

Use the REST API via `requests` or `httpx`:

```python
import httpx

MEMFORGE_URL = "http://localhost:3333"
MEMFORGE_TOKEN = "your-token"
AGENT_ID = "langchain-agent"

headers = {
    "Authorization": f"Bearer {MEMFORGE_TOKEN}",
    "Content-Type": "application/json",
}

def recall(query: str, limit: int = 5) -> list[str]:
    """Retrieve relevant memories. Returns [] if MemForge is unavailable."""
    try:
        r = httpx.get(
            f"{MEMFORGE_URL}/memory/{AGENT_ID}/query",
            params={"q": query, "limit": limit, "mode": "hybrid"},
            headers=headers,
            timeout=5.0,
        )
        return [m["content"] for m in r.json()["data"]]
    except Exception:
        return []  # Graceful degradation — agent works without memory

def store(content: str):
    """Store a memory. Silently fails if MemForge is unavailable."""
    try:
        httpx.post(
            f"{MEMFORGE_URL}/memory/{AGENT_ID}/add",
            json={"content": content},
            headers=headers,
            timeout=5.0,
        )
    except Exception:
        pass  # Memory store is best-effort

def consolidate():
    """Consolidate hot tier into searchable memory."""
    try:
        httpx.post(
            f"{MEMFORGE_URL}/memory/{AGENT_ID}/consolidate",
            json={"mode": "summarize"},
            headers=headers,
            timeout=30.0,
        )
    except Exception:
        pass
```

Wire into LangChain:

```python
from langchain.agents import AgentExecutor
from langchain.tools import tool

@tool
def remember(query: str) -> str:
    """Search long-term memory for relevant context."""
    memories = recall(query)
    return "\n".join(memories) if memories else "No relevant memories found."

@tool
def learn(content: str) -> str:
    """Store something important in long-term memory."""
    store(content)
    return "Stored in memory."

# Add to your agent's tools
agent = AgentExecutor(tools=[remember, learn, ...], ...)
```

### CrewAI (Python)

Same REST API, wrapped as CrewAI tools:

```python
from crewai.tools import tool

@tool("Search Memory")
def search_memory(query: str) -> str:
    """Search the agent's long-term memory for relevant information."""
    memories = recall(query)
    return "\n---\n".join(memories) if memories else "No memories found."

@tool("Store Memory")
def store_memory(content: str) -> str:
    """Store important information in long-term memory."""
    store(content)
    return "Stored."

# Add to your crew's agents
researcher = Agent(
    role="Researcher",
    tools=[search_memory, store_memory],
    ...
)
```

### OpenAI Function Calling

MemForge ships tool definitions in OpenAI's format:

```typescript
import { toOpenAITools } from '@salishforge/memforge/tools';
import OpenAI from 'openai';

const openai = new OpenAI();
const memforgeTools = toOpenAITools();

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  tools: memforgeTools,
  messages: [{ role: 'user', content: 'What do you remember about the deployment?' }],
});

// Handle tool calls — dispatch to MemForge REST API
for (const call of response.choices[0].message.tool_calls ?? []) {
  const result = await fetch(`http://localhost:3333/memory/my-agent/${call.function.name.replace('memforge_', '')}`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer token', 'Content-Type': 'application/json' },
    body: call.function.arguments,
  });
  // Feed result back to the conversation
}
```

### Anthropic Tool Use

```typescript
import { tools } from '@salishforge/memforge/tools';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  tools: tools,  // MemForge tools in Anthropic format
  messages: [{ role: 'user', content: 'What do you remember about the user?' }],
});
```

---

## Agent Identity: Choosing an Agent ID

The `agentId` is how MemForge isolates memory between agents. Choose a scheme that fits your architecture:

| Pattern | Example | Use When |
|---------|---------|----------|
| Per-agent | `support-bot` | One agent, one memory |
| Per-user | `user-alice` | Agent remembers each user separately |
| Per-agent-per-user | `support-bot:alice` | Multiple agents, each tracks users |
| Per-session | `session-abc123` | Ephemeral memory, discarded after session |
| Per-project | `project-frontend` | Agent works across multiple projects |

Agent IDs can be 1-256 characters of `[a-zA-Z0-9_.@:=-]`.

---

## Memory Lifecycle: When to Call What

| Event | MemForge Call | Frequency |
|-------|---------------|-----------|
| Agent receives a message | `query()` or `activeRecall()` | Every interaction |
| Agent produces a response | `add()` | Every interaction |
| Agent completes a task | `add()` with metadata | Per task |
| Retrieval was helpful | `feedback(ids, 'positive')` | When you know the outcome |
| Retrieval was unhelpful | `feedback(ids, 'negative')` | When you know the outcome |
| Batch of interactions complete | `consolidate()` | Every 10-50 interactions |
| Agent goes idle | `sleep()` | Every few hours |
| Weekly maintenance | `metaReflect()` | Weekly |
| Knowledge graph cleanup | `deduplicateEntities()` | Monthly or during sleep |

---

## Deployment

### Minimal (development)

```bash
# Just PostgreSQL — no Redis, no LLM, no embeddings
docker run -d --name pg -e POSTGRES_DB=memforge -e POSTGRES_PASSWORD=dev -p 5432:5432 pgvector/pgvector:pg16
psql postgresql://postgres:dev@localhost:5432/memforge -f schema/schema.sql

DATABASE_URL=postgresql://postgres:dev@localhost:5432/memforge npm start
```

This gives you keyword search and concat consolidation. No API keys needed.

### Full (production)

```bash
# Copy and edit environment
cp .env.docker .env
# Set: POSTGRES_PASSWORD, MEMFORGE_TOKEN, ADMIN_TOKEN
# Optionally set: LLM_PROVIDER, EMBEDDING_PROVIDER, API keys

docker compose up -d
```

This gives you everything: hybrid search, LLM consolidation, sleep cycles, Redis caching.

### As a Library (embedded in your app)

```typescript
import { MemoryManager } from '@salishforge/memforge';

const manager = new MemoryManager({
  databaseUrl: process.env.DATABASE_URL,
  consolidationMode: 'concat',
});

// Use directly — no HTTP server needed
await manager.add('agent-1', 'User prefers dark mode');
const results = await manager.query('agent-1', { q: 'preferences' });
```

---

## Export and Import

### Exporting Memories

Download the full warm-tier memory of an agent as JSONL (one JSON object per line):

```bash
curl "http://localhost:3333/memory/agent-1/export" \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" \
  > agent-1-backup.jsonl
```

```typescript
const jsonl = await client.export('agent-1');
fs.writeFileSync('backup.jsonl', jsonl);
```

```python
jsonl = await client.export("agent-1")
Path("backup.jsonl").write_text(jsonl)
```

Each line is a JSON object with `content`, `importance`, `confidence`, `created_at`, and optional `metadata`.

### Importing Memories

Bulk-load memories from a JSONL file (useful for migration, seeding, or restoring from backup):

```bash
curl -X POST "http://localhost:3333/memory/agent-1/import" \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @backup.jsonl
```

```typescript
const jsonl = fs.readFileSync('backup.jsonl', 'utf8');
await client.import('agent-1', jsonl);
```

Import writes directly to the warm tier — no hot-tier consolidation needed. Embeddings are regenerated on import if an embedding provider is configured.

---

## Webhook Events

Configure `WEBHOOK_URL` to receive event notifications:

```bash
WEBHOOK_URL=https://your-app.example.com/memforge-events
WEBHOOK_EVENTS=consolidated,revised,reflected   # omit to receive all events
```

### Payload Format

```json
{
  "event": "consolidated",
  "agentId": "agent-1",
  "timestamp": "2026-04-08T12:00:00.000Z",
  "data": {
    "hot_rows_processed": 42,
    "warm_rows_created": 8
  }
}
```

### Event Types

| Event | Trigger | `data` fields |
|-------|---------|---------------|
| `consolidated` | Hot→warm consolidation completes | `hot_rows_processed`, `warm_rows_created` |
| `revised` | Sleep Phase 3 revises a memory | `memory_id`, `decision`, `revision_count` |
| `reflected` | Reflection or meta-reflection completes | `reflection_id`, `level`, `insight_count` |
| `evicted` | Memory moved to cold tier | `memory_id`, `reason`, `importance` |
| `graduated` | Memory confidence promoted | `memory_id`, `old_confidence`, `new_confidence` |

Webhook delivery is best-effort — MemForge does not retry on failure. If your endpoint returns a non-2xx status, the event is logged and dropped.

---

## FAQ

**Do I need an LLM provider to use MemForge?**
No. Without an LLM, you get tiered storage, keyword search, concat consolidation, and timeline queries. LLM features (summarize consolidation, reflection, sleep cycle revision, procedural memory) require an LLM provider.

**Do I need embeddings / vector search?**
No. Without embeddings, search falls back to PostgreSQL full-text search with trigram matching. Add an embedding provider for semantic and hybrid search modes.

**Can I use MemForge with Python agents?**
Yes. Install the Python SDK (`pip install memforge`) for a typed async client with `MemForgeClient`, `ResilientMemForgeClient`, and `ConversationMemory`. Or use the REST API directly — MemForge is a standalone HTTP server that works with any language. See the Python SDK section and LangChain/CrewAI examples above.

**How much does it cost to run?**
MemForge itself is free (MIT license). Costs come from:
- PostgreSQL hosting (or run locally for free)
- LLM API calls during consolidation, reflection, and sleep cycles (optional — use Ollama for free local models)
- Embedding API calls (optional — use Ollama for free local embeddings)

**How do I give the agent memory across conversations?**
Use a stable `agentId`. As long as you use the same agent ID, all memories persist across conversations, sessions, and restarts. That's the point.

**What happens if MemForge is down?**
If you use `ResilientMemForgeClient` (recommended), nothing bad happens. Queries return empty results, stores are silently dropped, and the agent continues without long-term memory for that interaction. When MemForge comes back, everything resumes normally. If you use `MemForgeClient`, you need to catch errors yourself. For Python/REST integrations, wrap calls in try/except with timeouts (see examples above).
