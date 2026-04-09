"""Simple chatbot with persistent memory — the 'hello world' of MemForge integration.

Demonstrates:
  - ConversationMemory.start_session() for warm-start context
  - ConversationMemory.get_context() before each LLM call
  - ConversationMemory.add_turn() to record every exchange
  - ConversationMemory.end_session() to consolidate on exit

Run:
    pip install memforge openai
    OPENAI_API_KEY=... python examples/simple_chatbot.py
"""

import asyncio
import os
import sys
from typing import Optional

from memforge import ConversationMemory

AGENT_ID = "simple-chatbot"
SYSTEM_PROMPT = "You are a helpful assistant with persistent memory across sessions."


async def chat_turn(
    memory: ConversationMemory,
    user_message: str,
    openai_client: "openai.AsyncOpenAI",  # type: ignore[name-defined]
) -> str:
    """Process one user turn: recall, act, store."""
    # 1. Recall — fetch relevant past context before responding
    context = await memory.get_context(user_message, max_tokens=1500, limit=8)

    system = SYSTEM_PROMPT
    if context:
        system += f"\n\nRelevant memory:\n{context}"

    # 2. Act — call the LLM
    response = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ],
    )
    assistant_reply: str = response.choices[0].message.content or ""

    # 3. Store — record both turns
    await memory.add_turn("user", user_message)
    await memory.add_turn("assistant", assistant_reply)

    return assistant_reply


async def main() -> None:
    try:
        import openai
    except ImportError:
        print("Install openai: pip install openai", file=sys.stderr)
        sys.exit(1)

    if not os.environ.get("OPENAI_API_KEY"):
        print("Set OPENAI_API_KEY environment variable", file=sys.stderr)
        sys.exit(1)

    openai_client = openai.AsyncOpenAI()

    async with ConversationMemory(agent_id=AGENT_ID) as memory:
        # Warm-start: show what we remember from previous sessions
        session_context = await memory.start_session()
        if session_context:
            print(f"[Memory] Resuming session:\n{session_context}\n")
        else:
            print("[Memory] Starting fresh session\n")

        print("Chatbot ready. Type 'quit' to exit.\n")

        while True:
            try:
                user_input = input("You: ").strip()
            except (EOFError, KeyboardInterrupt):
                break

            if not user_input or user_input.lower() in {"quit", "exit"}:
                break

            try:
                reply = await chat_turn(memory, user_input, openai_client)
                print(f"Bot: {reply}\n")
            except Exception as e:
                print(f"[Error] {e}", file=sys.stderr)

        # End of session: consolidate hot-tier events into searchable memory
        print("\n[Memory] Consolidating session...")
        await memory.end_session()
        print("[Memory] Done. Memories will persist for next session.")


if __name__ == "__main__":
    asyncio.run(main())
