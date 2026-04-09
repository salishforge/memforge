"""LangChain integration using MemForge as conversation memory backend.

Demonstrates:
  - Wrapping ConversationMemory as a LangChain BaseChatMemory subclass
  - Injecting MemForge context into the LangChain chain via load_memory_variables
  - Storing LangChain exchanges back to MemForge via save_context
  - Drop-in replacement for ConversationBufferMemory

Run:
    pip install memforge langchain langchain-openai
    OPENAI_API_KEY=... python examples/langchain_memory.py
"""

import asyncio
import os
import sys
from typing import Any

AGENT_ID = "langchain-demo"


def build_memforge_memory(agent_id: str) -> "MemForgeMemory":
    """Create a LangChain-compatible memory backed by MemForge."""
    try:
        from langchain.memory.chat_memory import BaseChatMemory
        from langchain.schema import BaseMessage, HumanMessage, AIMessage
    except ImportError:
        print("Install langchain: pip install langchain", file=sys.stderr)
        sys.exit(1)

    from memforge import ConversationMemory

    class MemForgeMemory(BaseChatMemory):
        """LangChain memory adapter backed by MemForge persistent storage.

        Implements the minimal BaseChatMemory interface so it can be passed
        directly to any LangChain chain that accepts a ``memory`` parameter.
        """

        memory_key: str = "history"
        agent_id: str = "langchain-agent"
        _memforge: Any = None  # ConversationMemory, set via model_post_init

        class Config:
            arbitrary_types_allowed = True

        def __init__(self, agent_id: str = "langchain-agent", **kwargs: Any) -> None:
            super().__init__(**kwargs)
            object.__setattr__(self, "agent_id", agent_id)
            object.__setattr__(self, "_memforge", ConversationMemory(agent_id=agent_id))

        @property
        def memory_variables(self) -> list[str]:
            return [self.memory_key]

        def load_memory_variables(self, inputs: dict[str, Any]) -> dict[str, str]:
            """Retrieve relevant MemForge context synchronously for LangChain."""
            human_input = inputs.get("input", inputs.get("human_input", ""))
            context = asyncio.get_event_loop().run_until_complete(
                self._memforge.get_context(human_input, max_tokens=1500)
            )
            return {self.memory_key: context}

        def save_context(self, inputs: dict[str, Any], outputs: dict[str, str]) -> None:
            """Persist the latest exchange to MemForge."""
            human = inputs.get("input", inputs.get("human_input", ""))
            ai = outputs.get("output", outputs.get("response", ""))
            loop = asyncio.get_event_loop()
            if human:
                loop.run_until_complete(self._memforge.add_turn("user", human))
            if ai:
                loop.run_until_complete(self._memforge.add_turn("assistant", ai))

        def clear(self) -> None:
            """No-op: MemForge persists across sessions by design."""

    return MemForgeMemory(agent_id=agent_id)  # type: ignore[return-value]


async def main() -> None:
    try:
        from langchain_openai import ChatOpenAI
        from langchain.chains import ConversationChain
        from langchain.prompts import PromptTemplate
    except ImportError:
        print("Install: pip install langchain langchain-openai", file=sys.stderr)
        sys.exit(1)

    if not os.environ.get("OPENAI_API_KEY"):
        print("Set OPENAI_API_KEY environment variable", file=sys.stderr)
        sys.exit(1)

    memory = build_memforge_memory(AGENT_ID)

    chain = ConversationChain(
        llm=ChatOpenAI(model="gpt-4o-mini"),
        memory=memory,
        prompt=PromptTemplate(
            input_variables=["history", "input"],
            template=(
                "You are a helpful assistant. Past context:\n{history}\n\n"
                "Human: {input}\nAssistant:"
            ),
        ),
        verbose=False,
    )

    exchanges = [
        "My name is Alex and I prefer concise answers.",
        "What's a good way to structure a Python project?",
        "Do you remember my preference from earlier?",
    ]

    for user_msg in exchanges:
        print(f"Human: {user_msg}")
        response = chain.predict(input=user_msg)
        print(f"Assistant: {response}\n")

    print("[Memory] Consolidating session...")
    await memory._memforge.end_session()
    await memory._memforge.close()
    print("[Memory] Done.")


if __name__ == "__main__":
    asyncio.run(main())
