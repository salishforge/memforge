"""MemForge Python SDK — ConversationMemory adapter.

High-level interface for the most common use case: storing conversation
turns and retrieving relevant context for the next turn.

Usage:
    from memforge import ConversationMemory

    memory = ConversationMemory(agent_id="my-bot")

    # During conversation
    await memory.add_turn("user", "I prefer dark mode")
    await memory.add_turn("assistant", "Noted!")

    # Before responding to next message
    context = await memory.get_context("What are my preferences?", max_tokens=2000)

    # End of session
    await memory.end_session()
"""

from __future__ import annotations

from typing import Any, Optional

from .client import MemForgeClient
from .resilient import ResilientMemForgeClient


class ConversationMemory:
    """Store conversation turns and retrieve relevant context.

    Handles the recall→act→store→sleep lifecycle automatically.
    Uses ResilientMemForgeClient by default for graceful degradation.
    """

    def __init__(
        self,
        agent_id: str,
        base_url: str | None = None,
        token: str | None = None,
        resilient: bool = True,
    ):
        self.agent_id = agent_id
        if resilient:
            self._client = ResilientMemForgeClient(base_url=base_url, token=token)
        else:
            self._client = MemForgeClient(base_url=base_url, token=token)  # type: ignore[assignment]

    async def close(self) -> None:
        await self._client.close()

    async def __aenter__(self) -> "ConversationMemory":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def add_turn(
        self,
        role: str,
        content: str,
        outcome_type: str = "neutral",
    ) -> None:
        """Store a conversation turn as a memory event.

        Args:
            role: 'user', 'assistant', or 'system'
            content: The message content
            outcome_type: 'neutral', 'error', 'success', 'decision', 'observation'
        """
        tagged_content = f"[{role}]: {content}"
        await self._client.add(
            self.agent_id,
            tagged_content,
            metadata={"_role": role, "_source": "conversation"},
            outcome_type=outcome_type,
        )

    async def get_context(
        self,
        current_message: str,
        *,
        max_tokens: int = 2000,
        mode: str = "hybrid",
        limit: int = 10,
    ) -> str:
        """Retrieve relevant memories formatted as context for the next turn.

        Returns a string suitable for injection into a system prompt or
        context window. Respects the token budget.
        """
        results = await self._client.query(
            self.agent_id,
            q=current_message,
            mode=mode,
            limit=limit,
            max_tokens=max_tokens,
        )

        if not results:
            return ""

        lines = []
        for r in results:
            # Prefer summary if available (more token-efficient)
            text = r.summary if r.summary else r.content
            lines.append(f"- {text}")

        return "\n".join(lines)

    async def start_session(self, limit: int = 5) -> str:
        """Get warm-start context for beginning a new session.

        Returns formatted context from the resume endpoint.
        """
        ctx = await self._client.resume(self.agent_id, limit)
        if ctx is None:
            return ""

        lines = []
        if ctx.time_since_last_activity_ms is not None:
            hours = ctx.time_since_last_activity_ms / 3_600_000
            if hours < 1:
                lines.append(f"Last active: {int(hours * 60)} minutes ago")
            elif hours < 24:
                lines.append(f"Last active: {hours:.1f} hours ago")
            else:
                lines.append(f"Last active: {hours / 24:.1f} days ago")

        if ctx.top_memories:
            lines.append("\nRecent important memories:")
            for m in ctx.top_memories:
                lines.append(f"  - {m.get('content', '')[:200]}")

        if ctx.active_procedures:
            lines.append("\nActive rules:")
            for p in ctx.active_procedures:
                lines.append(f"  - IF {p.get('condition', '')} THEN {p.get('action', '')}")

        if ctx.open_contradictions:
            lines.append("\nOpen contradictions to resolve:")
            for c in ctx.open_contradictions:
                lines.append(f"  - {c}")

        return "\n".join(lines)

    async def end_session(self) -> None:
        """Consolidate hot-tier memories at end of session."""
        await self._client.consolidate(self.agent_id)
