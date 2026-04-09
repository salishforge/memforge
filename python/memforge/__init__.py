"""MemForge — Python SDK for neuroscience-inspired agent memory.

Usage:
    from memforge import MemForgeClient, ConversationMemory

    # Low-level client
    async with MemForgeClient() as client:
        await client.add("agent-1", "User prefers dark mode")
        results = await client.query("agent-1", q="preferences")

    # High-level conversation adapter
    async with ConversationMemory(agent_id="my-bot") as memory:
        await memory.add_turn("user", "I prefer dark mode")
        context = await memory.get_context("What are my preferences?")
"""

from .client import MemForgeClient, MemForgeError
from .resilient import ResilientMemForgeClient
from .conversation import ConversationMemory
from .types import (
    AddResult, QueryResult, ConsolidateResult, ClearResult, AgentStats,
    MemoryHealth, ResumeContext, FeedbackResult, SleepCycleResult,
    ReflectionResult, MemoryHints,
)

__version__ = "0.1.0"

__all__ = [
    "MemForgeClient",
    "MemForgeError",
    "ResilientMemForgeClient",
    "ConversationMemory",
    "MemoryHints",
    "AddResult",
    "QueryResult",
    "ConsolidateResult",
    "ClearResult",
    "AgentStats",
    "MemoryHealth",
    "ResumeContext",
    "FeedbackResult",
    "SleepCycleResult",
    "ReflectionResult",
]
