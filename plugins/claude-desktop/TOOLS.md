# MemForge Tools for Claude

This document describes all memory tools available to Claude when MemForge is connected via MCP. Use these tools to build persistent memory across conversations — remembering user preferences, tracking project context, learning from mistakes, and improving over time.

---

## Core Concept

You have access to a multi-tiered memory system. Memories flow through three tiers:

1. **Hot tier** — raw events stored by `memforge_add`. Fast writes, not yet searchable.
2. **Warm tier** — consolidated, searchable memories with embeddings. Created by `memforge_consolidate`.
3. **Cold tier** — archived memories. Moved there by `memforge_clear` or sleep cycle eviction.

The recommended workflow for every session:
1. **Start:** Call `memforge_active_recall` or `memforge_query` to load relevant context
2. **During:** Call `memforge_add` to store important information as it comes up
3. **End:** Call `memforge_consolidate` to make new memories searchable

---

## Tools Reference

### memforge_add

**Store a memory.** Use this whenever the user shares important information, you make a decision, something goes wrong, or you observe something worth remembering.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Consistent identifier for this user/context (e.g., "claude-desktop") |
| `content` | Yes | What to remember — be specific and complete |
| `metadata` | No | Structured data: `{"source": "conversation", "project": "memforge"}` |
| `outcome_type` | No | `neutral`, `error`, `success`, `decision`, `observation` |

**When to use:**
- User states a preference: *"I prefer TypeScript over JavaScript"*
- A decision is made: *"We decided to use PostgreSQL instead of MongoDB"*
- An error occurs: *"The deployment failed because the migration wasn't applied"*
- Important context: *"Alice is the team lead for the backend team"*

**Tips:**
- Store the full context, not just keywords. "User prefers dark mode in VS Code and vim keybindings" is better than "dark mode, vim".
- Tag errors with `outcome_type: "error"` — they get 2x importance in memory scoring.
- Tag decisions with `outcome_type: "decision"` — they get 1.5x importance.

---

### memforge_query

**Search memories.** Use this to find relevant past knowledge before answering a question or making a recommendation.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `q` | Yes | Natural language search query |
| `limit` | No | Max results (default 10, max 200) |
| `mode` | No | `keyword`, `semantic`, `hybrid` (default), or `code` |
| `max_tokens` | No | Token budget — return results fitting within this many tokens |

**When to use:**
- Before answering questions about past context: *"What do you know about our deployment process?"*
- Before making recommendations: search for past preferences and decisions
- When the user references something from a previous session

**Tips:**
- Use `hybrid` mode (default) for most queries — it combines keyword and semantic matching.
- Use `code` mode when searching for code patterns, function names, or file paths.
- Use `max_tokens` when you need to fit memories into a constrained context window.
- Ask natural questions — query understanding strips scaffolding and extracts time references automatically.

---

### memforge_consolidate

**Make recent memories searchable.** Moves hot-tier events into the warm tier with embeddings and importance scores.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `mode` | No | `concat` (default, fast) or `summarize` (LLM-driven, extracts entities) |

**When to use:**
- At the end of a conversation session
- After storing several related memories
- When the user says "save what you've learned" or similar

---

### memforge_active_recall

**Proactively surface relevant context.** Given a description of what you're about to do, retrieves memories and learned procedures that might be relevant.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `context` | Yes | What you're about to do: "reviewing a pull request for the auth service" |
| `limit` | No | Max memories to return (default 5, max 20) |

**When to use:**
- At the start of a task: "I'm about to help with deployment" → recall deployment-related memories
- Before giving advice: recall past outcomes of similar situations
- When the user starts a new topic: recall what you know about it

**This is the most valuable tool for session warm-start.** Call it early in every conversation.

---

### memforge_resume

**Get a session warm-start bundle.** Returns top memories, active procedures, open contradictions, and time since last activity. More structured than `active_recall`.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `limit` | No | Max memories (default 5, max 20) |

**When to use:**
- At the very start of a new conversation to restore context
- Returns time-since-last-activity which helps you understand the gap

---

### memforge_timeline

**Chronological memory retrieval.** Returns memories ordered by time, not relevance.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `from` | No | Start date (ISO 8601) |
| `to` | No | End date (ISO 8601) |
| `limit` | No | Max entries (default 50, max 500) |

**When to use:**
- "What happened last week?"
- "Show me the timeline of the deployment issue"
- When you need chronological narrative, not relevance-ranked results

---

### memforge_reflect

**Synthesize insights from recent memories.** Uses LLM to identify patterns, contradictions, and lessons learned across memories. Creates a reflection that future queries can reference.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `trigger` | No | `manual` (default), `threshold`, or `scheduled` |
| `limit` | No | Memories to review (default 20, max 100) |

**When to use:**
- After a significant body of work: "Reflect on what you've learned this week"
- When you notice recurring patterns: "What themes keep coming up?"
- Periodically, to maintain knowledge quality

**Requires an LLM provider configured on the server.**

---

### memforge_sleep

**Run a full maintenance cycle.** Scores, triages, revises, resolves conflicts, detects schemas, and reflects. This is the "overnight processing" that improves memory quality over time.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `token_budget` | No | Max LLM tokens to spend (default 100K, max 200K) |

**When to use:**
- During idle periods or at the user's request
- After accumulating many memories without reflection
- The user says "clean up your memory" or "do some housekeeping"

**This runs 10 phases** including conflict resolution, staleness detection, and schema discovery. It's the most comprehensive maintenance operation.

---

### memforge_feedback

**Tell the system whether memories were helpful.** Closes the learning loop — positive feedback strengthens memories, negative feedback flags them for revision.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `retrieval_ids` | Yes | Array of retrieval log IDs from a previous query |
| `outcome` | Yes | `positive`, `negative`, or `neutral` |

**When to use:**
- After using retrieved memories to help the user: mark as `positive`
- When retrieved memories were wrong or outdated: mark as `negative`
- This directly improves future retrieval quality

---

### memforge_entities

**Search the knowledge graph.** Find known entities (people, systems, concepts, organizations).

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `q` | No | Entity name search |
| `type` | No | Filter: `person`, `organization`, `system`, `concept`, `location`, `schema` |
| `limit` | No | Max results (default 20) |

---

### memforge_graph

**Traverse relationships between entities.** Starting from one entity, find everything connected to it.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `entity` | Yes | Starting entity name |
| `depth` | No | How many hops to traverse (default 2, max 5) |

**When to use:**
- "How is Alice connected to the deployment system?"
- "What do you know about everything related to PostgreSQL?"

---

### memforge_health

**Check memory quality metrics.** Returns importance scores, confidence levels, staleness, knowledge gaps, and contradiction rates.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |

**When to use:**
- To assess whether a sleep cycle is needed (high staleness, many gaps)
- To report on memory status to the user
- To decide whether to trust retrieved memories (check avg_confidence)

---

### memforge_stats

**Get tier counts.** Simple statistics: how many memories in hot, warm, and cold tiers.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |

---

### memforge_reflections

**Retrieve past reflections.** Access the insights and patterns identified by previous reflect operations.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `limit` | No | Max reflections (default 10) |

---

### memforge_procedures

**Retrieve learned rules.** Condition→action rules extracted from reflections — your accumulated "if this then that" knowledge.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `q` | No | Search conditions/actions |
| `limit` | No | Max procedures (default 20) |

**When to use:**
- Before starting a task: check if there are learned rules relevant to it
- "What rules have you learned about deployments?"

---

### memforge_meta_reflect

**Higher-order reflection.** Synthesizes patterns across first-order reflections — identifies recurring themes, blind spots, and durable principles.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `limit` | No | Reflections to review (default 10, min 3) |

---

### memforge_dedup_entities

**Clean up the knowledge graph.** Merges duplicate entities (e.g., "PostgreSQL" and "Postgres") using text similarity.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `threshold` | No | Similarity threshold (default 0.7, range 0.3–1.0) |

---

## Recommended Session Pattern

```
1. SESSION START
   → memforge_resume(agent_id) — load context
   → Read time_since_last_activity, top_memories, active_procedures

2. DURING CONVERSATION
   → memforge_query(agent_id, q=...) — search when user asks about past context
   → memforge_add(agent_id, content=...) — store important information
   → memforge_feedback(agent_id, ...) — rate retrieved memories

3. SESSION END
   → memforge_consolidate(agent_id) — make new memories searchable
```

For long-running agents, periodically run `memforge_sleep` to maintain knowledge quality.
