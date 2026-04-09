"""Anthropic Claude tool use with MemForge memory tools.

Demonstrates tool definitions, handling tool_use blocks, and routing to MemForge.

Run:
    pip install memforge anthropic
    ANTHROPIC_API_KEY=... python examples/claude_tools.py
"""

import asyncio
import json
import os
import sys
from typing import Any

from memforge import MemForgeClient
from memforge.tools import anthropic_tools

AGENT_ID = "claude-tools-demo"
SYSTEM_PROMPT = (
    "You are a helpful assistant with access to a persistent memory store. "
    "Use memforge_query to recall knowledge before answering. "
    "Use memforge_add to store important new facts."
)


async def dispatch_tool(client: MemForgeClient, name: str, args: dict[str, Any]) -> str:
    """Route an Anthropic tool_use block to the MemForge client."""
    try:
        if name == "memforge_add":
            r = await client.add(args["agent_id"], args["content"],
                                 outcome_type=args.get("outcome_type", "neutral"))
            return json.dumps({"id": r.id})
        if name == "memforge_query":
            results = await client.query(args["agent_id"], q=args["q"],
                                         limit=args.get("limit", 10), mode=args.get("mode"))
            return json.dumps([{"content": r.summary or r.content, "rank": r.rank} for r in results])
        if name == "memforge_consolidate":
            r = await client.consolidate(args["agent_id"], args.get("mode"))
            return json.dumps({"warm_rows_created": r.warm_rows_created})
        if name == "memforge_active_recall":
            r = await client.active_recall(args["agent_id"], args["context"], args.get("limit", 5))
            return json.dumps(r)
        if name == "memforge_stats":
            s = await client.stats(args["agent_id"])
            return json.dumps({"hot": s.hot_count, "warm": s.warm_count})
        return json.dumps({"error": f"Unknown tool: {name}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


async def run_agent_turn(client: MemForgeClient, ac: Any, user_message: str) -> str:
    """Run one agentic turn, looping over tool calls until Claude returns text."""
    tools = anthropic_tools()
    messages: list[dict[str, Any]] = [{"role": "user", "content": user_message}]
    while True:
        resp = await ac.messages.create(model="claude-haiku-4-5", max_tokens=1024,
                                         system=SYSTEM_PROMPT, tools=tools, messages=messages)
        messages.append({"role": "assistant", "content": resp.content})
        tool_uses = [b for b in resp.content if b.type == "tool_use"]
        if not tool_uses:
            texts = [b for b in resp.content if b.type == "text"]
            return texts[0].text if texts else ""
        results = []
        for b in tool_uses:
            results.append({"type": "tool_result", "tool_use_id": b.id,
                            "content": await dispatch_tool(client, b.name, b.input)})
        messages.append({"role": "user", "content": results})


async def main() -> None:
    try:
        import anthropic
    except ImportError:
        print("Install anthropic: pip install anthropic", file=sys.stderr); sys.exit(1)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Set ANTHROPIC_API_KEY", file=sys.stderr); sys.exit(1)

    ac = anthropic.AsyncAnthropic()
    async with MemForgeClient() as client:
        await client.add(AGENT_ID, "Our API rate limit is 1000 requests per minute")
        await client.add(AGENT_ID, "Database backups run daily at 03:00 UTC")
        await client.consolidate(AGENT_ID)
        query = "What infrastructure constraints should I know about?"
        print(f"User: {query}\n")
        print(f"Claude: {await run_agent_turn(client, ac, query)}")


if __name__ == "__main__":
    asyncio.run(main())
