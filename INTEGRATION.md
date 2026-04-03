# Integrating MemForge with AI Agents

This guide explains how to wire MemForge into any AI agent, regardless of framework. It covers the conceptual model, the integration points, and concrete examples for common setups.

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

// If you know the outcome was good or bad, record feedback
// (retrievalIds come from Step 1's query results)
await client.feedback(agentId, retrievalIds, 'positive');
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
```

**Use when:** Your agent is TypeScript/JavaScript and you want type-safe access.

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

---

## Framework-Specific Examples

### Custom Agent Loop (no framework)

The simplest integration — a while loop that processes messages:

```typescript
import { MemForgeClient } from '@salishforge/memforge/client';

const memory = new MemForgeClient();
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
    """Retrieve relevant memories before agent acts."""
    r = httpx.get(
        f"{MEMFORGE_URL}/memory/{AGENT_ID}/query",
        params={"q": query, "limit": limit, "mode": "hybrid"},
        headers=headers,
    )
    return [m["content"] for m in r.json()["data"]]

def store(content: str):
    """Store a memory after agent acts."""
    httpx.post(
        f"{MEMFORGE_URL}/memory/{AGENT_ID}/add",
        json={"content": content},
        headers=headers,
    )

def consolidate():
    """Consolidate hot tier into searchable memory."""
    httpx.post(
        f"{MEMFORGE_URL}/memory/{AGENT_ID}/consolidate",
        json={"mode": "summarize"},
        headers=headers,
    )
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

## FAQ

**Do I need an LLM provider to use MemForge?**
No. Without an LLM, you get tiered storage, keyword search, concat consolidation, and timeline queries. LLM features (summarize consolidation, reflection, sleep cycle revision, procedural memory) require an LLM provider.

**Do I need embeddings / vector search?**
No. Without embeddings, search falls back to PostgreSQL full-text search with trigram matching. Add an embedding provider for semantic and hybrid search modes.

**Can I use MemForge with Python agents?**
Yes. Use the REST API. MemForge is a standalone HTTP server — any language that can make HTTP requests works. See the LangChain and CrewAI examples above.

**How much does it cost to run?**
MemForge itself is free (MIT license). Costs come from:
- PostgreSQL hosting (or run locally for free)
- LLM API calls during consolidation, reflection, and sleep cycles (optional — use Ollama for free local models)
- Embedding API calls (optional — use Ollama for free local embeddings)

**How do I give the agent memory across conversations?**
Use a stable `agentId`. As long as you use the same agent ID, all memories persist across conversations, sessions, and restarts. That's the point.

**What happens if MemForge is down?**
Your agent should handle MemForge being unavailable gracefully — catch errors from the client SDK or REST calls and proceed without memory context. The agent works, just without long-term memory for that interaction.
