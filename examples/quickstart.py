"""MemForge Python Quickstart — the core recall → act → store → sleep pattern.

Mirrors examples/quickstart.ts and demonstrates all major API operations:
  - add()          Store events in the hot tier
  - consolidate()  Move hot tier to searchable warm tier
  - active_recall() Proactively surface relevant context
  - query()        Search warm tier by keyword or semantic similarity
  - timeline()     Retrieve events in chronological order
  - stats()        Inspect memory tier counts
  - clear()        Archive everything to cold tier

Prerequisites:
  1. MemForge server running: docker compose up -d  (or npm start)
  2. Set MEMFORGE_TOKEN if auth is enabled

Run:
    pip install memforge
    python examples/quickstart.py
"""

import asyncio
import os
import sys

from memforge import MemForgeClient
from memforge.client import MemForgeError

AGENT = "quickstart-agent-py"


async def main() -> None:
    base_url = os.environ.get("MEMFORGE_URL", "http://localhost:3333")
    token = os.environ.get("MEMFORGE_TOKEN")

    async with MemForgeClient(base_url=base_url, token=token) as client:
        # Verify server is reachable before running the demo
        try:
            await client.health()
        except Exception as e:
            print(f"Cannot reach MemForge at {base_url}: {e}", file=sys.stderr)
            print("Start the server: docker compose up -d", file=sys.stderr)
            sys.exit(1)

        print("=== MemForge Python Quickstart ===\n")

        # 1. Store memories in the hot tier
        print("1. Storing memories...")
        await client.add(AGENT, "The user prefers dark mode and compact layouts")
        await client.add(AGENT, "Deployed v2.3.0 to production on Monday — no issues")
        await client.add(AGENT, "The payments API rate-limits at 100 req/s — hit this during load test")
        await client.add(AGENT, "Alice from platform team caught a race condition in the session handler")
        await client.add(AGENT, "Never deploy on Fridays — learned from the 2025-11-14 incident")
        print("   Stored 5 memories in hot tier\n")

        # 2. Consolidate hot → warm tier (makes memories searchable)
        print("2. Consolidating hot → warm tier...")
        result = await client.consolidate(AGENT)
        print(f"   {result.hot_rows_processed} events → {result.warm_rows_created} warm memories\n")

        # 3. Active recall: surface relevant context before acting
        print("3. Active recall: preparing to deploy to production")
        recall = await client.active_recall(AGENT, "preparing to deploy to production")
        memories = recall.get("memories", []) if recall else []
        for m in memories:
            snippet = str(m.get("content", ""))[:80]
            relevance = m.get("relevance", "?")
            print(f"   [{relevance}] {snippet}...")
        if not memories:
            print("   (no results — consolidation may still be processing)")
        print()

        # 4. Keyword query
        print('4. Query: "payments API rate limit"')
        results = await client.query(AGENT, q="payments API rate limit", mode="keyword")
        for r in results:
            print(f"   [rank={r.rank:.3f}] {r.content[:80]}...")
        if not results:
            print("   (no results)")
        print()

        # 5. Timeline: chronological view
        print("5. Timeline (last 3):")
        timeline = await client.timeline(AGENT, limit=3)
        for entry in timeline:
            content = str(entry.get("content", ""))[:80]
            print(f"   {content}...")
        if not timeline:
            print("   (empty)")
        print()

        # 6. Memory statistics
        print("6. Memory stats:")
        stats = await client.stats(AGENT)
        print(f"   Hot: {stats.hot_count} | Warm: {stats.warm_count} | Cold: {stats.cold_count}")
        print(f"   Entities: {stats.entity_count} | Reflections: {stats.reflection_count}\n")

        # 7. Clean up — archive to cold tier
        print("7. Cleaning up (archiving to cold tier)...")
        cleared = await client.clear(AGENT)
        print(f"   Archived {cleared.hot_archived} hot + {cleared.warm_archived} warm rows\n")

    print("=== Next steps ===")
    print("  Add an LLM provider:     LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=...")
    print("  Enable vector search:    EMBEDDING_PROVIDER=local")
    print("  Run a sleep cycle:       POST /memory/your-agent/sleep")
    print("  Chatbot example:         python examples/simple_chatbot.py")
    print("  See INTEGRATION.md for framework-specific guides")


if __name__ == "__main__":
    asyncio.run(main())
