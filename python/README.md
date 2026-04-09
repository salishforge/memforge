# MemForge Python SDK

Python client for [MemForge](https://github.com/salishforge/memforge) — neuroscience-inspired memory for AI agents.

## Install

```bash
pip install memforge
```

## Quick Start

```python
import asyncio
from memforge import ConversationMemory

async def main():
    async with ConversationMemory(agent_id="my-bot") as memory:
        # Store conversation turns
        await memory.add_turn("user", "I prefer dark mode and vim keybindings")
        await memory.add_turn("assistant", "Noted! I'll remember your preferences.")

        # Get relevant context for the next turn
        context = await memory.get_context("What are my preferences?", max_tokens=2000)
        print(context)

        # End session — consolidate memories
        await memory.end_session()

asyncio.run(main())
```

## Low-Level Client

```python
from memforge import MemForgeClient

async with MemForgeClient(base_url="http://localhost:3333", token="...") as client:
    # Store
    await client.add("agent-1", "Deployment uses GitHub Actions")

    # Search (keyword, semantic, hybrid, or code mode)
    results = await client.query("agent-1", q="deployment", mode="hybrid", limit=5)

    # Budget-controlled retrieval
    results = await client.query("agent-1", q="deployment", max_tokens=2000)

    # Knowledge graph
    entities = await client.search_entities("agent-1", q="Alice")
    graph = await client.graph_traverse("agent-1", entity="Alice", depth=2)

    # Sleep cycle (consolidate, revise, reflect)
    await client.sleep("agent-1")

    # Session resumption (warm-start context)
    context = await client.resume("agent-1")
```

## Resilient Client (Production)

```python
from memforge import ResilientMemForgeClient

client = ResilientMemForgeClient(on_error=lambda e: print(f"memforge: {e}"))
results = await client.query("agent-1", q="test")  # returns [] on failure, never throws
```

## LLM Tool Definitions

```python
from memforge.tools import openai_tools, anthropic_tools

# OpenAI function calling
response = openai.chat.completions.create(tools=openai_tools(), ...)

# Anthropic tool use
response = anthropic.messages.create(tools=anthropic_tools(), ...)
```

## Requirements

- Python 3.10+
- httpx
- MemForge server running (see [main README](../README.md))

## API Reference

| Method | Description |
|--------|-------------|
| `add(agent_id, content)` | Store memory event |
| `query(agent_id, q=, mode=, max_tokens=)` | Search memories |
| `consolidate(agent_id)` | Hot→warm consolidation |
| `timeline(agent_id)` | Chronological retrieval |
| `clear(agent_id)` | Archive to cold tier |
| `stats(agent_id)` | Tier statistics |
| `search_entities(agent_id)` | Knowledge graph search |
| `graph_traverse(agent_id, entity)` | Graph traversal |
| `reflect(agent_id)` | LLM reflection |
| `sleep(agent_id)` | Full sleep cycle |
| `memory_health(agent_id)` | Health metrics |
| `resume(agent_id)` | Session resumption context |
| `feedback(agent_id, ids, outcome)` | Retrieval feedback |
| `active_recall(agent_id, context)` | Proactive memory surfacing |
