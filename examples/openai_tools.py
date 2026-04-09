"""OpenAI function calling with MemForge memory tools.

Demonstrates tool definitions, handling tool_calls, and routing to MemForge.

Run:
    pip install memforge openai
    OPENAI_API_KEY=... python examples/openai_tools.py
"""

import asyncio
import json
import os
import sys
from typing import Any

from memforge import MemForgeClient
from memforge.tools import openai_tools

AGENT_ID = "openai-tools-demo"
SYSTEM_PROMPT = (
    "You are a helpful assistant with access to a persistent memory store. "
    "Use memforge_query to recall knowledge before answering. "
    "Use memforge_add to store important new information."
)


async def dispatch_tool(client: MemForgeClient, name: str, args: dict[str, Any]) -> str:
    """Route an OpenAI tool_call to the MemForge client."""
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


async def run_agent_turn(client: MemForgeClient, oc: Any, user_message: str) -> str:
    """Run one agentic turn, looping over tool calls until the model returns text."""
    tools = openai_tools()
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]
    while True:
        resp = await oc.chat.completions.create(model="gpt-4o-mini", messages=messages,
                                                 tools=tools, tool_choice="auto")
        msg = resp.choices[0].message
        messages.append(msg.model_dump(exclude_none=True))
        if not msg.tool_calls:
            return msg.content or ""
        for tc in msg.tool_calls:
            result = await dispatch_tool(client, tc.function.name, json.loads(tc.function.arguments))
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})


async def main() -> None:
    try:
        import openai
    except ImportError:
        print("Install openai: pip install openai", file=sys.stderr); sys.exit(1)
    if not os.environ.get("OPENAI_API_KEY"):
        print("Set OPENAI_API_KEY", file=sys.stderr); sys.exit(1)

    oc = openai.AsyncOpenAI()
    async with MemForgeClient() as client:
        await client.add(AGENT_ID, "The team deploys every Tuesday at 14:00 UTC")
        await client.add(AGENT_ID, "Redis cache TTL is 5 minutes for hot paths")
        await client.consolidate(AGENT_ID)
        query = "When do we deploy and what's our cache TTL?"
        print(f"User: {query}\n")
        print(f"Assistant: {await run_agent_turn(client, oc, query)}")


if __name__ == "__main__":
    asyncio.run(main())
